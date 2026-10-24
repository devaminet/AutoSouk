import { randomUUID } from "crypto";
import { createClient, type RedisClientType } from "redis";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../db";
import { appSettingsVersionTable } from "../../db/schema/app_settings";
import { signinUser } from "../../test/helpers";
import {
  createInMemorySettingsBus,
  type SettingsBus,
  type SettingsSnapshot,
} from "../bus";
import { createRedisSettingsBus } from "../redis_bus";
import {
  createSettingsStore,
  getSetting,
  startSettingsSync,
  stopSettingsSync,
} from "../store";
import {
  connectRedis,
  disconnectRedis,
  getRedisClients,
} from "../../cache/redis";

type State = { version: number; overrides: { key: string; value: unknown }[] };

// Stands in for Postgres, shared by every simulated instance.
const createDatabase = (initial: State = { version: 0, overrides: [] }) => {
  let state = initial;
  return {
    write: (overrides: Record<string, unknown>) => {
      state = {
        version: state.version + 1,
        overrides: Object.entries(overrides).map(([key, value]) => ({
          key,
          value,
        })),
      };
    },
    load: jest.fn(async () => state),
  };
};

const waitFor = async (condition: () => boolean, timeoutMs = 3_000) => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const stores: ReturnType<typeof createSettingsStore>[] = [];

const createInstance = async (
  database: ReturnType<typeof createDatabase>,
  bus: SettingsBus,
) => {
  const store = createSettingsStore(database.load);
  stores.push(store);
  await store.load();
  await store.startSync(bus);
  return store;
};

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.stopSync()));
});

describe("settings store sync", () => {
  it("should spread a write from one instance to the others", async () => {
    const database = createDatabase();
    const bus = createInMemorySettingsBus();
    const writer = await createInstance(database, bus);
    const reader = await createInstance(database, bus);

    database.write({ "listings.car.minYear": 1990 });
    await writer.load();
    await writer.publish();

    await waitFor(() => reader.getVersion() === 1);
    expect(reader.getValues()["listings.car.minYear"]).toBe(1990);
  });

  it("should ignore a change that is not newer than the local copy", async () => {
    const database = createDatabase({
      version: 3,
      overrides: [{ key: "listings.car.minYear", value: 1990 }],
    });
    const bus = createInMemorySettingsBus();
    const store = await createInstance(database, bus);

    await bus.publish({
      version: 2,
      overrides: { "listings.car.minYear": 1960 },
    });
    await flush();

    expect(store.getVersion()).toBe(3);
    expect(store.getValues()["listings.car.minYear"]).toBe(1990);
  });

  it("should validate values received from the bus", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const database = createDatabase();
    const bus = createInMemorySettingsBus();
    const store = await createInstance(database, bus);

    await bus.publish({
      version: 1,
      overrides: {
        "uploads.carImage.maxSizeBytes": "huge",
        "listings.car.minYear": 1990,
      },
    });

    await waitFor(() => store.getVersion() === 1);
    expect(store.getValues()["uploads.carImage.maxSizeBytes"]).toBe(
      10 * 1024 * 1024,
    );
    expect(store.getValues()["listings.car.minYear"]).toBe(1990);
  });

  it("should reload from the database when the shared copy is missing the announced version", async () => {
    const database = createDatabase();
    const listeners: ((version: number) => void)[] = [];
    const brokenBus: SettingsBus = {
      publish: async () => true,
      readLatest: async () => null,
      subscribe: async (listener) => {
        listeners.push((version) => listener({ type: "changed", version }));
        return async () => undefined;
      },
    };
    const store = await createInstance(database, brokenBus);

    database.write({ "listings.car.minYear": 1990 });
    listeners.forEach((notify) => notify(1));

    await waitFor(() => store.getVersion() === 1);
    expect(store.getValues()["listings.car.minYear"]).toBe(1990);
  });

  it("should reload from the database when reading the bus fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const database = createDatabase();
    let notify: (version: number) => void = () => undefined;
    const offlineBus: SettingsBus = {
      publish: async () => {
        throw new Error("offline");
      },
      readLatest: async () => {
        throw new Error("offline");
      },
      subscribe: async (listener) => {
        notify = (version) => listener({ type: "changed", version });
        return async () => undefined;
      },
    };
    const store = await createInstance(database, offlineBus);

    database.write({ "listings.car.minYear": 1990 });
    notify(1);

    await waitFor(() => store.getVersion() === 1);
  });

  it("should republish its copy when the shared copy is behind on connect", async () => {
    const database = createDatabase({
      version: 4,
      overrides: [{ key: "listings.car.minYear", value: 1990 }],
    });
    const bus = createInMemorySettingsBus();

    await createInstance(database, bus);
    await flush();

    await expect(bus.readLatest()).resolves.toEqual<SettingsSnapshot>({
      version: 4,
      overrides: { "listings.car.minYear": 1990 },
    });
  });

  it("should catch up from the database on reconnect after missing a change", async () => {
    const database = createDatabase();
    let reconnect: () => void = () => undefined;
    const silentBus: SettingsBus = {
      publish: async () => true,
      readLatest: async () => null,
      subscribe: async (listener) => {
        reconnect = () => listener({ type: "connected" });
        return async () => undefined;
      },
    };
    const store = await createInstance(database, silentBus);

    // written while this instance was disconnected, and never announced
    database.write({ "listings.car.minYear": 1990 });
    reconnect();

    await waitFor(() => store.getVersion() === 1);
    expect(store.getValues()["listings.car.minYear"]).toBe(1990);
  });

  it("should not publish when settings were never written", async () => {
    const bus = createInMemorySettingsBus();
    const store = await createInstance(createDatabase(), bus);

    await expect(store.publish()).resolves.toBe(false);
    await expect(bus.readLatest()).resolves.toBeNull();
  });

  it("should not fail when publishing to an offline bus", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const database = createDatabase({ version: 1, overrides: [] });
    const store = createSettingsStore(database.load);
    stores.push(store);
    await store.load();
    await store.startSync({
      publish: async () => {
        throw new Error("offline");
      },
      readLatest: async () => null,
      subscribe: async () => async () => undefined,
    });

    await expect(store.publish()).resolves.toBe(false);
  });

  it("should stop receiving changes after stopSync", async () => {
    const database = createDatabase();
    const bus = createInMemorySettingsBus();
    const store = await createInstance(database, bus);
    await store.stopSync();

    await bus.publish({ version: 1, overrides: {} });
    await flush();

    expect(store.getVersion()).toBe(0);
  });
});

describe("settings store over redis", () => {
  let prefix = "";

  beforeEach(async () => {
    prefix = `test-${randomUUID()}`;
    await connectRedis();
  });

  afterEach(async () => {
    const { command } = getRedisClients();
    const keys = await command.keys(`${prefix}:*`);
    if (keys.length > 0) await command.del(keys);
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it("should spread a write between two instances", async () => {
    const database = createDatabase();
    const { command, subscriber } = getRedisClients();
    const bus = createRedisSettingsBus({ command, subscriber, prefix });
    const writer = await createInstance(database, bus);
    const reader = await createInstance(database, bus);

    database.write({ "listings.car.maxDoors": 12 });
    await writer.load();
    await expect(writer.publish()).resolves.toBe(true);

    await waitFor(() => reader.getVersion() === 1);
    expect(reader.getValues()["listings.car.maxDoors"]).toBe(12);
  });
});

describe("settings store with Redis down at boot", () => {
  it("should serve the database copy and keep running", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const unreachable = (): RedisClientType =>
      createClient({
        url: "redis://127.0.0.1:1",
        disableOfflineQueue: true,
        socket: { reconnectStrategy: 50 },
      });
    const command = unreachable();
    const subscriber = unreachable();
    command.on("error", () => undefined);
    subscriber.on("error", () => undefined);
    command.connect().catch(() => undefined);
    subscriber.connect().catch(() => undefined);

    const database = createDatabase({
      version: 2,
      overrides: [{ key: "listings.car.minYear", value: 1990 }],
    });
    const bus = createRedisSettingsBus({
      command,
      subscriber,
      prefix: `test-${randomUUID()}`,
    });

    const store = await createInstance(database, bus);

    expect(store.getVersion()).toBe(2);
    expect(store.getValues()["listings.car.minYear"]).toBe(1990);
    await expect(store.publish()).resolves.toBe(false);

    command.destroy();
    subscriber.destroy();
  });
});

describe("settings API publishing", () => {
  afterEach(async () => {
    await stopSettingsSync();
  });

  it("should bump the version and publish after an admin update and reset", async () => {
    const bus = createInMemorySettingsBus();
    await startSettingsSync(bus);
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    const [before] = await db
      .select({ version: appSettingsVersionTable.version })
      .from(appSettingsVersionTable);
    const startVersion = before?.version ?? 0;

    await request(app)
      .patch("/api/settings")
      .send({ values: { "listings.car.minYear": 1990 } })
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    await expect(bus.readLatest()).resolves.toEqual({
      version: startVersion + 1,
      overrides: { "listings.car.minYear": 1990 },
    });

    await request(app)
      .delete("/api/settings/listings.car.minYear")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    await expect(bus.readLatest()).resolves.toEqual({
      version: startVersion + 2,
      overrides: {},
    });
    expect(getSetting("listings.car.minYear")).toBe(1950);
  });

  it("should not bump the version when resetting a setting without override", async () => {
    const bus = createInMemorySettingsBus();
    await startSettingsSync(bus);
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    const readVersion = async () => {
      const [row] = await db
        .select({ version: appSettingsVersionTable.version })
        .from(appSettingsVersionTable);
      return row?.version ?? 0;
    };
    const versionBefore = await readVersion();

    await request(app)
      .delete("/api/settings/listings.car.minYear")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    await expect(readVersion()).resolves.toBe(versionBefore);
  });
});

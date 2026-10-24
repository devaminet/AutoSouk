import { randomUUID } from "crypto";
import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import {
  createInMemorySettingsBus,
  type SettingsBus,
} from "../../../settings/bus";
import { createRedisSettingsBus } from "../../../settings/redis_bus";
import {
  createSettingsStore,
  getSetting,
  startSettingsSync,
  stopSettingsSync,
} from "../../../settings/store";
import { findSettingsState } from "../db";
import {
  connectRedis,
  disconnectRedis,
  getRedisClients,
} from "../../../cache/redis";

const signinAdmin = async () =>
  (await signinUser({ email: "admin@autosouk.com", password: "Admin_@@789" }))
    .accessToken;

const republish = (token: string) =>
  request(app).post("/api/settings/republish").auth(token, { type: "bearer" });

const waitFor = async (condition: () => boolean, timeoutMs = 3_000) => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

afterEach(async () => {
  await stopSettingsSync();
});

describe("POST /api/settings/republish", () => {
  it("should require authentication", () => {
    return request(app).post("/api/settings/republish").expect(401);
  });

  it("should reject non admin users", async () => {
    await signupUserWithVerification({ userType: "seller" });
    const seller = await signinUser();

    await republish(seller.accessToken).expect(403);
  });

  it("should return 503 when settings sync is not running", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const token = await signinAdmin();

    const response = await republish(token).expect(503);

    expect(response.body.errors[0].message).toMatch(/could not be published/);
  });

  it("should return 503 when the bus is unreachable", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const offlineBus: SettingsBus = {
      publish: async () => {
        throw new Error("offline");
      },
      readLatest: async () => {
        throw new Error("offline");
      },
      subscribe: async () => async () => undefined,
    };
    await startSettingsSync(offlineBus);
    const token = await signinAdmin();

    await republish(token).expect(503);
  });

  it("should publish the database copy with a newer version", async () => {
    const bus = createInMemorySettingsBus();
    await startSettingsSync(bus);
    const token = await signinAdmin();
    await request(app)
      .patch("/api/settings")
      .send({ values: { "listings.car.minYear": 1990 } })
      .auth(token, { type: "bearer" })
      .expect(200);
    const before = (await bus.readLatest())?.version ?? 0;

    const response = await republish(token).expect(200);

    const latest = await bus.readLatest();
    expect(latest).toEqual({
      version: before + 1,
      overrides: { "listings.car.minYear": 1990 },
    });
    expect(response.headers.etag).toBe(`"${before + 1}"`);
  });
});

describe("republish after a database restore", () => {
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

  it("should unblock publishing when the shared copy is ahead of the database", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { command, subscriber } = getRedisClients();
    const bus = createRedisSettingsBus({ command, subscriber, prefix });
    const token = await signinAdmin();
    const patch = (values: Record<string, unknown>) =>
      request(app)
        .patch("/api/settings")
        .send({ values })
        .auth(token, { type: "bearer" })
        .expect(200);

    // Redis still holds a copy from before the database was restored, with
    // a higher version than the database.
    const { version: databaseVersion } = await findSettingsState();
    await bus.publish({
      version: databaseVersion + 100,
      overrides: { "listings.car.minYear": 1960 },
    });

    const otherInstance = createSettingsStore(findSettingsState);
    await otherInstance.load();
    await otherInstance.startSync(bus);
    await startSettingsSync(bus);
    await waitFor(() => warn.mock.calls.length >= 2);
    expect(String(warn.mock.calls[0][0])).toMatch(/ahead of the database/);

    // Writes are saved but can't reach the other instance.
    await patch({ "listings.car.minYear": 1990 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(otherInstance.getValues()["listings.car.minYear"]).toBe(1950);

    await republish(token).expect(200);

    await expect(bus.readLatest()).resolves.toEqual({
      version: databaseVersion + 101,
      overrides: { "listings.car.minYear": 1990 },
    });
    await waitFor(
      () => otherInstance.getValues()["listings.car.minYear"] === 1990,
    );

    // Normal sync works again.
    await patch({ "listings.car.maxDoors": 7 });
    await waitFor(
      () => otherInstance.getValues()["listings.car.maxDoors"] === 7,
    );
    expect(getSetting("listings.car.maxDoors")).toBe(7);
    await otherInstance.stopSync();
  });
});

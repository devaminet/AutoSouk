import { randomUUID } from "crypto";
import {
  createInMemorySettingsBus,
  type SettingsBus,
  type SettingsBusEvent,
  type Unsubscribe,
} from "../bus";
import { createRedisSettingsBus } from "../redis_bus";
import {
  connectRedis,
  disconnectRedis,
  getRedisClients,
} from "../../cache/redis";

const nextEvent = (
  events: SettingsBusEvent[],
  predicate: (event: SettingsBusEvent) => boolean,
  timeoutMs = 3_000,
) =>
  new Promise<SettingsBusEvent>((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const match = events.find(predicate);
      if (match) return resolve(match);
      if (Date.now() - startedAt > timeoutMs) {
        return reject(new Error("Timed out waiting for a bus event"));
      }
      setTimeout(check, 10);
    };
    check();
  });

const snapshot = (
  version: number,
  overrides: Record<string, unknown> = {},
) => ({
  version,
  overrides,
});

type BusFactory = () => Promise<SettingsBus>;

let prefix = "";
const unsubscribers: Unsubscribe[] = [];

const listen = async (bus: SettingsBus) => {
  const events: SettingsBusEvent[] = [];
  unsubscribers.push(await bus.subscribe((event) => events.push(event)));
  return events;
};

const createRedisBus: BusFactory = async () => {
  await connectRedis();
  const { command, subscriber } = getRedisClients();
  return createRedisSettingsBus({ command, subscriber, prefix });
};

beforeEach(() => {
  prefix = `test-${randomUUID()}`;
});

afterEach(async () => {
  await Promise.all(
    unsubscribers.splice(0).map((unsubscribe) => unsubscribe()),
  );
  const { command } = getRedisClients();
  if (command.isReady) {
    const keys = await command.keys(`${prefix}:*`);
    if (keys.length > 0) await command.del(keys);
  }
});

afterAll(async () => {
  await disconnectRedis();
});

describe.each<[string, BusFactory]>([
  ["in-memory", async () => createInMemorySettingsBus()],
  ["redis", createRedisBus],
])("%s settings bus", (_name, createBus) => {
  it("should return null before anything is published", async () => {
    const bus = await createBus();

    await expect(bus.readLatest()).resolves.toBeNull();
  });

  it("should store a published snapshot and notify subscribers", async () => {
    const bus = await createBus();
    const events = await listen(bus);

    await expect(
      bus.publish(snapshot(1, { "listings.car.minYear": 1990 })),
    ).resolves.toBe(true);

    await nextEvent(events, (event) => event.type === "changed");
    expect(events).toContainEqual({ type: "changed", version: 1 });
    await expect(bus.readLatest()).resolves.toEqual(
      snapshot(1, { "listings.car.minYear": 1990 }),
    );
  });

  it("should tell a new subscriber it is connected", async () => {
    const bus = await createBus();
    const events = await listen(bus);

    await expect(
      nextEvent(events, (event) => event.type === "connected"),
    ).resolves.toEqual({ type: "connected" });
  });

  it("should ignore a version that is not newer than the stored one", async () => {
    const bus = await createBus();
    await bus.publish(snapshot(5, { a: 5 }));

    await expect(bus.publish(snapshot(4, { a: 4 }))).resolves.toBe(false);
    await expect(bus.publish(snapshot(5, { a: 6 }))).resolves.toBe(false);
    await expect(bus.readLatest()).resolves.toEqual(snapshot(5, { a: 5 }));
  });

  it("should reject an invalid snapshot", async () => {
    const bus = await createBus();

    await expect(bus.publish(snapshot(0))).rejects.toThrow();
  });

  it("should stop notifying after unsubscribe", async () => {
    const bus = await createBus();
    const events: SettingsBusEvent[] = [];
    const unsubscribe = await bus.subscribe((event) => events.push(event));
    await unsubscribe();

    await bus.publish(snapshot(1));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events.filter((event) => event.type === "changed")).toHaveLength(0);
  });
});

describe("redis settings bus", () => {
  it("should keep the newest snapshot when publishes race", async () => {
    const bus = await createRedisBus();

    const results = await Promise.all(
      [3, 1, 5, 2, 4].map((version) => bus.publish(snapshot(version))),
    );

    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    await expect(bus.readLatest()).resolves.toEqual(snapshot(5));
  });

  it("should return null for a corrupted stored snapshot", async () => {
    const bus = await createRedisBus();
    const { command } = getRedisClients();

    await command.set(`${prefix}:{settings}:snapshot`, "not json");
    await expect(bus.readLatest()).resolves.toBeNull();

    await command.set(
      `${prefix}:{settings}:snapshot`,
      JSON.stringify({ version: "x", overrides: [] }),
    );
    await expect(bus.readLatest()).resolves.toBeNull();
  });

  it("should ignore malformed messages on the channel", async () => {
    const bus = await createRedisBus();
    const events = await listen(bus);
    const { command } = getRedisClients();

    await command.publish(`${prefix}:settings:changed`, "garbage");
    await bus.publish(snapshot(1));

    await nextEvent(events, (event) => event.type === "changed");
    expect(events.filter((event) => event.type === "changed")).toEqual([
      { type: "changed", version: 1 },
    ]);
  });

  it("should resubscribe and report connected after a dropped connection", async () => {
    const bus = await createRedisBus();
    const events = await listen(bus);
    await nextEvent(events, (event) => event.type === "connected");
    events.length = 0;

    const { command } = getRedisClients();
    await command.sendCommand(["CLIENT", "KILL", "TYPE", "pubsub"]);

    await nextEvent(events, (event) => event.type === "connected", 5_000);
    await bus.publish(snapshot(1));
    await expect(
      nextEvent(events, (event) => event.type === "changed"),
    ).resolves.toEqual({ type: "changed", version: 1 });
  });
});

import {
  connectRedis,
  disconnectRedis,
  getRedisClients,
  isRedisReady,
  reconnectDelay,
} from "../redis";

afterEach(async () => {
  await disconnectRedis();
});

it("should connect the command and subscriber clients", async () => {
  await connectRedis();

  expect(isRedisReady()).toBe(true);
  await expect(getRedisClients().command.ping()).resolves.toBe("PONG");
});

it("should deliver published messages to the subscriber client", async () => {
  await connectRedis();
  const { command, subscriber } = getRedisClients();
  const channel = `test:${Date.now()}`;

  let resolveMessage: (message: string) => void = () => undefined;
  const received = new Promise<string>((resolve) => {
    resolveMessage = resolve;
  });
  // resolves once Redis acknowledges the subscription
  await subscriber.subscribe(channel, (message) => resolveMessage(message));
  await command.publish(channel, "hello");

  await expect(received).resolves.toBe("hello");
});

it("should report not ready and allow reconnecting after disconnect", async () => {
  await connectRedis();
  await disconnectRedis();

  expect(isRedisReady()).toBe(false);

  await connectRedis();
  expect(isRedisReady()).toBe(true);
});

it("should be a no-op to disconnect when never connected", async () => {
  await expect(disconnectRedis()).resolves.toBeUndefined();
});

it("should back off exponentially up to a ceiling", () => {
  jest.spyOn(Math, "random").mockReturnValue(0);

  expect(reconnectDelay(0)).toBe(50);
  expect(reconnectDelay(3)).toBe(400);
  expect(reconnectDelay(20)).toBe(10_000);
});

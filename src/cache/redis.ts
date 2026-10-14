import { z } from "zod";
import { createClient, type RedisClientType } from "redis";

const redisUrlSchema = z
  .string({ required_error: "REDIS_URL is required" })
  .url()
  .refine((url) => /^rediss?:\/\//.test(url), {
    message: "REDIS_URL must start with redis:// or rediss://",
  });

const MAX_RECONNECT_DELAY_MS = 10_000;

// Exponential backoff with jitter so instances don't reconnect in lockstep.
// Always retries: Redis is a cache, the app keeps serving while it is down.
export const reconnectDelay = (retries: number): number => {
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(2 ** retries * 50, MAX_RECONNECT_DELAY_MS) + jitter;
};

const buildClient = (url: string, name: string): RedisClientType =>
  createClient({
    url,
    name: `autosouk-${name}`,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: reconnectDelay,
    },
    // Fail fast while disconnected instead of queueing commands until Redis
    // comes back, so callers can fall back to Postgres.
    disableOfflineQueue: true,
    pingInterval: 30_000,
  });

const attachLogging = (client: RedisClientType, name: string) => {
  // Without an error listener node-redis errors crash the process.
  client.on("error", (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Redis ${name} client error: ${message}`);
  });
  client.on("reconnecting", () =>
    console.warn(`Redis ${name} client reconnecting`),
  );
  client.on("ready", () => console.log(`Redis ${name} client ready`));
};

type RedisClients = {
  command: RedisClientType;
  subscriber: RedisClientType;
};

let clients: RedisClients | null = null;

// A subscribed connection can only run pub/sub commands, so subscriptions get
// their own connection.
export const getRedisClients = (): RedisClients => {
  if (!clients) {
    const { NODE_ENV, REDIS_URL, TEST_REDIS_URL } = process.env;
    const url = redisUrlSchema.parse(
      NODE_ENV === "test" ? TEST_REDIS_URL : REDIS_URL,
    );
    const command = buildClient(url, "command");
    const subscriber = buildClient(url, "subscriber");
    attachLogging(command, "command");
    attachLogging(subscriber, "subscriber");
    clients = { command, subscriber };
  }
  return clients;
};

export const isRedisReady = (): boolean =>
  clients !== null && clients.command.isReady && clients.subscriber.isReady;

// Resolves once both connections are up. node-redis retries internally until
// then, so boot code should not await this when Redis is optional.
export const connectRedis = async (): Promise<void> => {
  const { command, subscriber } = getRedisClients();
  await Promise.all(
    [command, subscriber]
      .filter((client) => !client.isOpen)
      .map((client) => client.connect()),
  );
};

export const disconnectRedis = async (): Promise<void> => {
  if (!clients) {
    return;
  }
  const { command, subscriber } = clients;
  clients = null;

  await Promise.all(
    [command, subscriber].map(async (client) => {
      if (client.isReady) {
        // close() waits for pending replies before closing the socket.
        await client.close();
      } else if (client.isOpen) {
        // Still reconnecting: nothing to flush, stop retrying.
        client.destroy();
      }
    }),
  );
};

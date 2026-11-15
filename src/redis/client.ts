import { createClient } from "redis";

// The Redis that every server process shares. In development it defaults to
// the one in docker-compose.yml; production must set REDIS_URL.
const redisUrl = () => {
  const url = process.env.REDIS_URL;
  if (url) {
    return url;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is required in production");
  }
  return "redis://localhost:6379";
};

// Set once the first connection succeeds.
let connectedOnce = false;

export const redis = createClient({
  url: redisUrl(),
  // While Redis is unreachable, commands fail at once instead of waiting in
  // a queue. Callers that can do without Redis, such as rate limits and
  // session events, then go on instead of hanging the request.
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5000,
    // Gives up at once when Redis can't be reached at start, so the server
    // (or a test run) fails with a clear error. After that, it keeps trying,
    // waiting up to 3 seconds between tries.
    reconnectStrategy: (retries: number, cause: Error) =>
      connectedOnce ? Math.min(retries * 100, 3000) : cause,
  },
});

redis.on("ready", () => {
  connectedOnce = true;
});

// Without a listener, a lost connection would crash the process. The client
// reconnects on its own.
redis.on("error", (error: Error) => {
  console.error("Redis error:", error.message);
});

export const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

export const closeRedis = async () => {
  if (redis.isOpen) {
    await redis.close();
  }
};

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

export const redis = createClient({ url: redisUrl() });

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

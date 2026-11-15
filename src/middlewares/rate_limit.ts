import { NextFunction, Request, Response } from "express";
import { TooManyRequestsError } from "../errors/too_many_requests_error";
import { redis } from "../redis/client";

// Counts live in Redis, so every server process shares them.
const keyPrefix = "rate-limit:";

// Forgets every count. For tests.
export const resetRateLimits = async () => {
  for await (const keys of redis.scanIterator({ MATCH: `${keyPrefix}*`, COUNT: 100 })) {
    if (keys.length > 0) {
      await redis.unlink(keys);
    }
  }
};

// Counts one request in the key's window and returns the new count and the
// milliseconds left. The window starts with the first request, and Redis
// deletes the key when it ends. One transaction, so processes can't race.
const hit = async (key: string, windowMs: number) => {
  const [, count, msLeft] = await redis
    .multi()
    .set(key, 0, { condition: "NX", expiration: { type: "PX", value: windowMs } })
    .incr(key)
    .pTTL(key)
    .exec();
  return { count: Number(count), msLeft: Math.max(0, Number(msLeft)) };
};

type RateLimitOptions = {
  // Names the limit, so different limits don't share counts.
  name: string;
  windowMs: number;
  max: number;
  // What to count by, such as the IP or the email. Null skips the limit.
  key: (req: Request) => string | null;
};

// Answers 429 auth.too_many_attempts once a key made `max` requests in the
// window. Every request counts, successful or not. If Redis can't be reached,
// the request goes through: a Redis outage shouldn't lock everyone out.
export const rateLimit = ({ name, windowMs, max, key }: RateLimitOptions) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const value = key(req);
    if (value === null) {
      return next();
    }
    let result: { count: number; msLeft: number };
    try {
      result = await hit(`${keyPrefix}${name}:${value}`, windowMs);
    } catch (error) {
      console.error(`Rate limit ${name} skipped:`, (error as Error).message);
      return next();
    }
    if (result.count > max) {
      const minutes = Math.max(1, Math.ceil(result.msLeft / 60000));
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(result.msLeft / 1000))));
      return next(new TooManyRequestsError("auth.too_many_attempts", { minutes }));
    }
    return next();
  };

export const byIp = (req: Request) => req.ip ?? null;

// The email in the body, so one account can't be targeted from many IPs.
export const byEmail = (req: Request) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
};

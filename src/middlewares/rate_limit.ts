import { NextFunction, Request, Response } from "express";
import { TooManyRequestsError } from "../errors/too_many_requests_error";

type Window = { count: number; resetAt: number };

// Counts in memory, so the limits hold per server process. With several
// processes, move the counts to a shared store such as Redis.
const windows = new Map<string, Window>();

// Forgets every count. For tests.
export const resetRateLimits = () => windows.clear();

type RateLimitOptions = {
  // Names the limit, so different limits don't share counts.
  name: string;
  windowMs: number;
  max: number;
  // What to count by, such as the IP or the email. Null skips the limit.
  key: (req: Request) => string | null;
};

// Answers 429 auth.too_many_attempts once a key made `max` requests in the
// window. Every request counts, successful or not.
export const rateLimit = ({ name, windowMs, max, key }: RateLimitOptions) =>
  (req: Request, res: Response, next: NextFunction) => {
    const value = key(req);
    if (value === null) {
      return next();
    }
    const id = `${name}:${value}`;
    const now = Date.now();
    // Drops finished windows now and then, so memory stays bounded.
    if (windows.size > 10_000) {
      for (const [key, old] of windows) {
        if (old.resetAt <= now) {
          windows.delete(key);
        }
      }
    }
    let window = windows.get(id);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(id, window);
    }
    window.count += 1;
    if (window.count > max) {
      const minutes = Math.max(1, Math.ceil((window.resetAt - now) / 60000));
      res.setHeader("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
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

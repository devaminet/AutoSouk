import { redis } from "../../redis/client";

// Session events go through Redis pub/sub, so the server that ends a session
// reaches the browser even when another server holds its event stream. Each
// user has a channel, and a server listens to it only while it holds a stream
// of that user.

// Which of the user's sessions ended: every one, those of a device, or one.
export type RevokedTarget = "all" | { deviceId: number } | { sessionId: number };

export type SessionEvent =
  | { type: "session.revoked"; target: RevokedTarget }
  // A device of the user signed in or out, so its list of devices changed.
  | { type: "devices.changed" };

// The session behind a stream.
type WatchedSession = { id: number; userId: number; deviceId: number | null };

// A stream open on this server.
type Watcher = { session: WatchedSession; onEvent: (event: SessionEvent) => void };

const channel = (userId: number) => `session-events:user:${userId}`;

const watchers = new Map<number, Set<Watcher>>();
// Each user's subscription, shared by their streams on this server.
const subscriptions = new Map<number, Promise<void>>();

// Subscribing blocks a Redis connection, so it gets its own.
let subscriber: ReturnType<typeof redis.duplicate> | null = null;

const getSubscriber = async () => {
  if (!subscriber) {
    subscriber = redis.duplicate();
    subscriber.on("error", (error: Error) => {
      console.error("Redis subscriber error:", error.message);
    });
  }
  if (!subscriber.isOpen) {
    await subscriber.connect();
  }
  return subscriber;
};

const parseTarget = (target: unknown): RevokedTarget | null => {
  if (target === "all") {
    return target;
  }
  if (typeof target !== "object" || target === null) {
    return null;
  }
  const { deviceId, sessionId } = target as { deviceId?: unknown; sessionId?: unknown };
  if (typeof deviceId === "number") {
    return { deviceId };
  }
  return typeof sessionId === "number" ? { sessionId } : null;
};

const parseEvent = (message: string): SessionEvent | null => {
  try {
    const event = JSON.parse(message) as { type?: unknown; target?: unknown };
    if (event.type === "session.revoked") {
      const target = parseTarget(event.target);
      return target ? { type: event.type, target } : null;
    }
    return event.type === "devices.changed" ? { type: event.type } : null;
  } catch {
    return null;
  }
};

const concerns = (event: SessionEvent, session: WatchedSession) => {
  if (event.type === "devices.changed" || event.target === "all") {
    return true;
  }
  return "deviceId" in event.target
    ? event.target.deviceId === session.deviceId
    : event.target.sessionId === session.id;
};

const deliver = (userId: number, message: string) => {
  const event = parseEvent(message);
  if (!event) {
    return;
  }
  for (const watcher of watchers.get(userId) ?? []) {
    if (concerns(event, watcher.session)) {
      watcher.onEvent(event);
    }
  }
};

// The change already happened in the database, so a failure here only delays
// the browser noticing it: it logs and goes on.
const publish = async (userId: number, event: SessionEvent) => {
  try {
    await redis.publish(channel(userId), JSON.stringify(event));
  } catch (error) {
    console.error("Could not publish a session event:", (error as Error).message);
  }
};

// Tells every server that sessions of the user ended.
export const publishSessionRevoked = (userId: number, target: RevokedTarget) =>
  publish(userId, { type: "session.revoked", target });

// Tells the user's signed-in browsers to reload their list of devices.
export const publishDevicesChanged = (userId: number) =>
  publish(userId, { type: "devices.changed" });

const subscribe = (userId: number) => {
  let subscription = subscriptions.get(userId);
  if (!subscription) {
    subscription = getSubscriber()
      .then((client) => client.subscribe(channel(userId), (message) => deliver(userId, message)))
      .catch((error: unknown) => {
        subscriptions.delete(userId);
        throw error;
      });
    subscriptions.set(userId, subscription);
  }
  return subscription;
};

const removeWatcher = (watcher: Watcher) => {
  const { userId } = watcher.session;
  const current = watchers.get(userId);
  if (!current?.delete(watcher) || current.size > 0) {
    return;
  }
  watchers.delete(userId);
  subscriptions.delete(userId);
  void subscriber?.unsubscribe(channel(userId)).catch(() => undefined);
};

// Calls onEvent with the events that concern this session. Returns the
// function that stops watching. If Redis can't subscribe, it throws and
// watches nothing; other streams of the user keep their own watchers.
export const watchSession = async (
  session: WatchedSession,
  onEvent: (event: SessionEvent) => void,
) => {
  const watcher: Watcher = { session, onEvent };
  let userWatchers = watchers.get(session.userId);
  if (!userWatchers) {
    userWatchers = new Set();
    watchers.set(session.userId, userWatchers);
  }
  userWatchers.add(watcher);
  try {
    await subscribe(session.userId);
  } catch (error) {
    removeWatcher(watcher);
    throw error;
  }
  return () => removeWatcher(watcher);
};

// Closes the subscriber connection. For tests and shutdown.
export const closeSessionEvents = async () => {
  watchers.clear();
  subscriptions.clear();
  if (subscriber?.isOpen) {
    await subscriber.close();
  }
  subscriber = null;
};

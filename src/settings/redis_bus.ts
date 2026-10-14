import { z } from "zod";
import type { RedisClientType } from "redis";
import {
  settingsSnapshotSchema,
  type SettingsBus,
  type SettingsBusListener,
  type SettingsSnapshot,
} from "./bus";

type RedisSettingsBusOptions = {
  command: RedisClientType;
  subscriber: RedisClientType;
  // Namespaces keys and the channel, e.g. per environment or per test.
  prefix?: string;
};

// Compare-and-set in one atomic step: store and announce the snapshot only
// when its version is newer than the stored one.
const PUBLISH_IF_NEWER = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local version = tonumber(ARGV[1])
if version <= current then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('PUBLISH', ARGV[3], ARGV[1])
return 1
`;

const versionMessageSchema = z.coerce.number().int().positive();

export const createRedisSettingsBus = ({
  command,
  subscriber,
  prefix = "autosouk",
}: RedisSettingsBusOptions): SettingsBus => {
  // The hash tag keeps both keys in one slot, which a Lua script needs on
  // Redis Cluster.
  const versionKey = `${prefix}:{settings}:version`;
  const snapshotKey = `${prefix}:{settings}:snapshot`;
  const channel = `${prefix}:settings:changed`;

  return {
    async publish(snapshot: SettingsSnapshot) {
      const parsed = settingsSnapshotSchema.parse(snapshot);
      const stored = await command.eval(PUBLISH_IF_NEWER, {
        keys: [versionKey, snapshotKey],
        arguments: [String(parsed.version), JSON.stringify(parsed), channel],
      });
      return stored === 1;
    },

    async readLatest() {
      const raw = await command.get(snapshotKey);
      if (raw === null) {
        return null;
      }

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        console.error("Stored settings snapshot is not valid JSON");
        return null;
      }

      const parsed = settingsSnapshotSchema.safeParse(json);
      if (!parsed.success) {
        console.error("Stored settings snapshot has an invalid shape");
        return null;
      }
      return parsed.data;
    },

    async subscribe(listener: SettingsBusListener) {
      const onMessage = (message: string) => {
        const version = versionMessageSchema.safeParse(message);
        if (version.success) {
          listener({ type: "changed", version: version.data });
        } else {
          console.warn(`Ignoring invalid settings message "${message}"`);
        }
      };

      // node-redis restores subscriptions on reconnect. Subscribing again on
      // every "ready" also covers a bus created while Redis was down, and is
      // a no-op otherwise because listeners are kept in a set.
      const onReady = async () => {
        try {
          await subscriber.subscribe(channel, onMessage);
          listener({ type: "connected" });
        } catch (error) {
          console.error("Could not subscribe to settings changes:", error);
        }
      };

      subscriber.on("ready", onReady);
      if (subscriber.isReady) {
        await onReady();
      }

      return async () => {
        subscriber.off("ready", onReady);
        if (subscriber.isReady) {
          await subscriber.unsubscribe(channel, onMessage);
        }
      };
    },
  };
};

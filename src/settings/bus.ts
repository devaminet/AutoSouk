import { z } from "zod";

// What instances share: the admin overrides (not the resolved values, so
// each instance applies its own code defaults) tagged with a version that
// only grows.
export const settingsSnapshotSchema = z.object({
  version: z.number().int().positive(),
  overrides: z.record(z.string(), z.unknown()),
});

export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;

export type SettingsBusEvent =
  // Another instance published this version.
  | { type: "changed"; version: number }
  // The connection to the bus was (re)established. Messages may have been
  // missed while disconnected, so listeners should compare versions.
  | { type: "connected" };

export type SettingsBusListener = (event: SettingsBusEvent) => void;

export type Unsubscribe = () => Promise<void>;

export interface SettingsBus {
  // Stores the snapshot and notifies subscribers. A version that is not
  // newer than the stored one is ignored, so late or duplicate publishes
  // can't roll the shared copy back. Resolves to whether it was stored.
  publish(snapshot: SettingsSnapshot): Promise<boolean>;
  // The latest stored snapshot, or null when there is none or it is invalid.
  readLatest(): Promise<SettingsSnapshot | null>;
  subscribe(listener: SettingsBusListener): Promise<Unsubscribe>;
}

// Single-process bus for tests and tools that run without Redis.
export const createInMemorySettingsBus = (): SettingsBus => {
  let latest: SettingsSnapshot | null = null;
  const listeners = new Set<SettingsBusListener>();

  return {
    async publish(snapshot) {
      const parsed = settingsSnapshotSchema.parse(snapshot);
      if (latest && parsed.version <= latest.version) {
        return false;
      }
      latest = structuredClone(parsed);
      // Delivered asynchronously, like a real message bus.
      listeners.forEach((listener) =>
        queueMicrotask(() =>
          listener({ type: "changed", version: parsed.version }),
        ),
      );
      return true;
    },

    async readLatest() {
      return latest ? structuredClone(latest) : null;
    },

    async subscribe(listener) {
      listeners.add(listener);
      queueMicrotask(() => listener({ type: "connected" }));
      return async () => {
        listeners.delete(listener);
      };
    },
  };
};

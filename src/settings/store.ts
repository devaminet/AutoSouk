import { findSettingsState } from "../api/settings/db";
import type {
  SettingsBus,
  SettingsBusEvent,
  SettingsSnapshot,
  Unsubscribe,
} from "./bus";
import {
  findRuleViolations,
  getDefaultSettings,
  isSettingKey,
  settingDefinitions,
  settingKeys,
  type SettingKey,
  type SettingValues,
} from "./definitions";

type SettingOverride = { key: string; value: unknown };

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

// Merges overrides over the defaults, skipping unknown keys and values that
// fail their schema. Cross-setting rules are not applied here.
export const mergeOverrides = (overrides: SettingOverride[]): SettingValues => {
  const values = getDefaultSettings();
  const writable = values as Record<SettingKey, unknown>;

  for (const { key, value } of overrides) {
    if (!isSettingKey(key)) {
      console.warn(`Ignoring unknown setting "${key}"`);
      continue;
    }
    const parsed = settingDefinitions[key].schema.safeParse(value);
    if (parsed.success) {
      writable[key] = parsed.data;
    } else {
      console.error(`Invalid stored value for "${key}", using default`);
    }
  }

  return values;
};

// Invalid or inconsistent stored values never break the app: they are logged
// and replaced by defaults.
export const resolveSettings = (
  overrides: SettingOverride[],
): SettingValues => {
  const defaults = getDefaultSettings();
  const values = mergeOverrides(overrides);
  const writable = values as Record<SettingKey, unknown>;

  for (const violation of findRuleViolations(values)) {
    console.error(`${violation.message}, using defaults`);
    for (const key of violation.keys) {
      writable[key] = defaults[key];
    }
  }

  return values;
};

type SettingsState = { version: number; overrides: SettingOverride[] };

type LocalSnapshot = {
  version: number;
  // Raw overrides are kept so this instance can republish them as is.
  overrides: Readonly<Record<string, unknown>>;
  values: Readonly<SettingValues>;
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Holds the settings an instance validates against. Postgres is the source
// of truth: it is read at boot and after local writes. The bus only spreads
// changes between instances, and versions decide which copy is newer, so
// late, duplicate or replayed messages never roll settings back.
export const createSettingsStore = (
  loadState: () => Promise<SettingsState>,
) => {
  let current: LocalSnapshot = deepFreeze({
    version: 0,
    overrides: {},
    values: getDefaultSettings(),
  });
  let bus: SettingsBus | null = null;
  let unsubscribe: Unsubscribe | null = null;

  // A copy from Postgres may replace one with the same version (the database
  // wins); a copy from the bus must be strictly newer.
  const apply = (state: SettingsState, allowSameVersion: boolean) => {
    const isNewer = allowSameVersion
      ? state.version >= current.version
      : state.version > current.version;
    if (!isNewer) {
      return false;
    }
    current = deepFreeze({
      version: state.version,
      overrides: Object.fromEntries(
        state.overrides.map(({ key, value }) => [key, value]),
      ),
      values: resolveSettings(state.overrides),
    });
    return true;
  };

  const load = async () => {
    apply(await loadState(), true);
  };

  // Best effort: the change is already committed in Postgres, and other
  // instances resync when they next connect to the bus.
  const publish = async () => {
    if (!bus || current.version === 0) {
      return false;
    }
    try {
      return await bus.publish({
        version: current.version,
        overrides: { ...current.overrides },
      });
    } catch (error) {
      console.error(`Could not publish settings: ${describeError(error)}`);
      return false;
    }
  };

  const toState = (snapshot: SettingsSnapshot): SettingsState => ({
    version: snapshot.version,
    overrides: Object.entries(snapshot.overrides).map(([key, value]) => ({
      key,
      value,
    })),
  });

  // Another instance announced a version: take it from the shared copy, or
  // from the source of truth when the shared copy is missing or older.
  const syncChanged = async (activeBus: SettingsBus, version: number) => {
    const latest = await activeBus.readLatest();
    if (latest && latest.version >= version) {
      apply(toState(latest), false);
    } else {
      await load();
    }
  };

  // Changes may have been missed while disconnected, and their writer may be
  // gone, so reload from Postgres. Then repair the shared copy if it is
  // behind, e.g. after Redis lost its data or a publish failed.
  const syncConnected = async (activeBus: SettingsBus) => {
    await load();
    const latest = await activeBus.readLatest();
    if ((latest?.version ?? 0) < current.version) {
      await publish();
    }
  };

  const handleEvent = async (
    activeBus: SettingsBus,
    event: SettingsBusEvent,
  ) => {
    try {
      if (event.type === "connected") {
        await syncConnected(activeBus);
      } else if (event.version > current.version) {
        await syncChanged(activeBus, event.version);
      }
    } catch (error) {
      console.error(`Could not sync settings: ${describeError(error)}`);
      if (event.type === "changed") {
        await load().catch((loadError: unknown) =>
          console.error(
            `Could not reload settings: ${describeError(loadError)}`,
          ),
        );
      }
    }
  };

  const startSync = async (nextBus: SettingsBus) => {
    await stopSync();
    bus = nextBus;
    unsubscribe = await nextBus.subscribe((event) => {
      void handleEvent(nextBus, event);
    });
  };

  const stopSync = async () => {
    const stop = unsubscribe;
    bus = null;
    unsubscribe = null;
    if (stop) {
      await stop();
    }
  };

  return {
    getValues: (): Readonly<SettingValues> => current.values,
    getVersion: () => current.version,
    load,
    publish,
    startSync,
    stopSync,
  };
};

const settingsStore = createSettingsStore(findSettingsState);

export const getSettings = (): Readonly<SettingValues> =>
  settingsStore.getValues();

export const getSetting = <K extends SettingKey>(key: K): SettingValues[K] =>
  settingsStore.getValues()[key];

export const getPublicSettings = (): Partial<SettingValues> => {
  const values = settingsStore.getValues();
  return Object.fromEntries(
    settingKeys
      .filter((key) => settingDefinitions[key].isPublic)
      .map((key) => [key, values[key]]),
  );
};

// Replaces the local copy with what Postgres holds.
export const loadSettings = settingsStore.load;

// Reloads from Postgres after a local write, then tells other instances.
export const refreshAndPublishSettings = async () => {
  await settingsStore.load();
  await settingsStore.publish();
};

export const startSettingsSync = settingsStore.startSync;
export const stopSettingsSync = settingsStore.stopSync;

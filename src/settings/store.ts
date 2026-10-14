import { z } from "zod";
import { findAllSettingOverrides } from "../api/settings/db";
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

let snapshot: Readonly<SettingValues> = deepFreeze(getDefaultSettings());
let refreshTimer: NodeJS.Timeout | null = null;

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

export const getSettings = (): Readonly<SettingValues> => snapshot;

export const getSetting = <K extends SettingKey>(key: K): SettingValues[K] =>
  snapshot[key];

export const getPublicSettings = (): Partial<SettingValues> =>
  Object.fromEntries(
    settingKeys
      .filter((key) => settingDefinitions[key].isPublic)
      .map((key) => [key, snapshot[key]]),
  );

export const loadSettings = async () => {
  snapshot = deepFreeze(resolveSettings(await findAllSettingOverrides()));
};

const refreshIntervalSchema = z.coerce.number().int().min(5).max(3600);

// Picks up changes made by other instances. A failed refresh keeps the last
// good snapshot.
export const startSettingsRefresh = (
  rawIntervalSeconds = process.env.SETTINGS_REFRESH_INTERVAL_SECONDS ?? "30",
) => {
  const intervalSeconds = refreshIntervalSchema.parse(rawIntervalSeconds);
  stopSettingsRefresh();
  refreshTimer = setInterval(() => {
    loadSettings().catch((error) =>
      console.error("Could not refresh settings:", error),
    );
  }, intervalSeconds * 1000);
  refreshTimer.unref();
};

export const stopSettingsRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

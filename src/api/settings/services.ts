import { createHash } from "crypto";
import { ZodIssue } from "zod";
import { NotFoundError } from "../../errors/not_found_error";
import { PreconditionFailedError } from "../../errors/precondition_failed_error";
import { ServiceUnavailableError } from "../../errors/service_unavailable_error";
import { RequestValidationError } from "../../errors/request_validation_error";
import {
  findRuleViolations,
  isSettingKey,
  settingDefinitions,
  settingKeys,
  type SettingKey,
} from "../../settings/definitions";
import {
  getPublicSettings,
  getSettings,
  mergeOverrides,
  readSharedSettingsVersion,
  refreshAndPublishSettings,
  resolveSettings,
} from "../../settings/store";
import { findSettingsState, withSettingsWriteLock } from "./db";

type SettingOverrideRow = Awaited<
  ReturnType<typeof findSettingsState>
>["overrides"][number];

// "any" stands for `If-Match: *`; undefined means no precondition was sent.
export type VersionPrecondition = number[] | "any" | undefined;

const describeSettings = (overrides: SettingOverrideRow[]) => {
  const values = resolveSettings(overrides);
  const overridesByKey = new Map(overrides.map((row) => [row.key, row]));

  return settingKeys.map((key) => {
    const { defaultValue, isPublic, description } = settingDefinitions[key];
    const override = overridesByKey.get(key);
    return {
      key,
      value: values[key],
      defaultValue,
      isDefault: !override,
      isPublic,
      description,
      updatedBy: override?.updatedBy ?? null,
      updatedAt: override?.updatedAt ?? null,
    };
  });
};

export const listSettings = async () => {
  const { version, overrides } = await findSettingsState();
  return { version, settings: describeSettings(overrides) };
};

// Optimistic concurrency: an admin editing from a stale page gets a 412
// instead of silently overwriting a change they never saw.
const assertVersionMatches = (
  precondition: VersionPrecondition,
  currentVersion: number,
) => {
  if (Array.isArray(precondition) && !precondition.includes(currentVersion)) {
    throw new PreconditionFailedError(
      "Settings were changed by someone else. Reload them and try again.",
    );
  }
};

const parseSettingChanges = (changes: Record<string, unknown>) => {
  const issues: ZodIssue[] = [];
  const parsed: { key: SettingKey; value: unknown }[] = [];

  for (const [key, value] of Object.entries(changes)) {
    if (!isSettingKey(key)) {
      issues.push({ code: "custom", message: "Unknown setting", path: [key] });
      continue;
    }
    const result = settingDefinitions[key].schema.safeParse(value);
    if (result.success) {
      parsed.push({ key, value: result.data });
    } else {
      issues.push(
        ...result.error.errors.map((issue) => ({
          ...issue,
          path: [key, ...issue.path],
        })),
      );
    }
  }

  return { parsed, issues };
};

const toRuleIssues = (
  violations: ReturnType<typeof findRuleViolations>,
  changedKeys: string[],
): ZodIssue[] =>
  violations.flatMap(({ keys, message }) => {
    const blamed = keys.filter((key) => changedKeys.includes(key));
    return (blamed.length > 0 ? blamed : keys).map((key) => ({
      code: "custom" as const,
      message,
      path: [key],
    }));
  });

// Validates every change and the merged result before writing, so a partial
// update can never leave settings inconsistent. Rules are checked inside the
// write lock against the latest committed overrides, so concurrent updates
// can't break a rule together.
export const updateSettings = async (
  changes: Record<string, unknown>,
  adminId: number,
  precondition?: VersionPrecondition,
) => {
  const { parsed, issues } = parseSettingChanges(changes);
  if (issues.length > 0) {
    throw new RequestValidationError(issues);
  }

  await withSettingsWriteLock(async (writer) => {
    assertVersionMatches(precondition, writer.version);

    const current = await writer.findOverrides();
    const violations = findRuleViolations(
      mergeOverrides([...current, ...parsed]),
    );
    if (violations.length > 0) {
      throw new RequestValidationError(
        toRuleIssues(violations, Object.keys(changes)),
      );
    }

    await writer.upsertOverrides(parsed, adminId);
    await writer.bumpVersion();
  });

  await refreshAndPublishSettings();
  return listSettings();
};

export const resetSetting = async (
  key: string,
  precondition?: VersionPrecondition,
) => {
  if (!isSettingKey(key)) {
    throw new NotFoundError("Setting not found");
  }

  const changed = await withSettingsWriteLock(async (writer) => {
    assertVersionMatches(precondition, writer.version);

    const current = await writer.findOverrides();
    const violations = findRuleViolations(
      mergeOverrides(current.filter((row) => row.key !== key)),
    );
    if (violations.length > 0) {
      throw new RequestValidationError(
        violations.map(({ message }) => ({
          code: "custom",
          message: `Resetting would break a rule: ${message}`,
          path: [key],
        })),
      );
    }

    // Nothing to reset: leave the version alone.
    if (!(await writer.deleteOverride(key))) {
      return false;
    }
    await writer.bumpVersion();
    return true;
  });

  if (changed) {
    await refreshAndPublishSettings();
  }
  return listSettings();
};

const republishUnavailable = () =>
  new ServiceUnavailableError(
    "Settings could not be published. Check that Redis is reachable and try again.",
  );

// Repairs the shared copy and every instance from Postgres. Normal sync
// already heals most gaps; this is for cases it can't, such as a database
// restored to an older version than the one Redis and the instances hold.
// The new version is set above both copies, so every instance accepts it.
export const republishSettings = async () => {
  let sharedVersion: number;
  try {
    sharedVersion = await readSharedSettingsVersion();
  } catch (error) {
    console.error("Could not read the shared settings version:", error);
    throw republishUnavailable();
  }

  await withSettingsWriteLock((writer) =>
    writer.bumpVersion(Math.max(writer.version, sharedVersion)),
  );

  if (!(await refreshAndPublishSettings())) {
    throw republishUnavailable();
  }
  return listSettings();
};

type PublicSettingsPayload = {
  settings: ReturnType<typeof getPublicSettings>;
  entityTag: string;
};

// Keyed by the frozen snapshot, so the hash is computed once per settings
// change rather than once per request.
const publicPayloadCache = new WeakMap<object, PublicSettingsPayload>();

// The tag hashes the content, not the version: code defaults can change in a
// deploy without a settings write, and the tag must change with them. Equal
// content gives the same tag on every instance.
export const getPublicSettingsPayload = (): PublicSettingsPayload => {
  const snapshot = getSettings();
  const cached = publicPayloadCache.get(snapshot);
  if (cached) {
    return cached;
  }

  const settings = getPublicSettings();
  const hash = createHash("sha256")
    .update(JSON.stringify(settings))
    .digest("base64url")
    .slice(0, 27);
  const payload = { settings, entityTag: `"${hash}"` };
  publicPayloadCache.set(snapshot, payload);
  return payload;
};

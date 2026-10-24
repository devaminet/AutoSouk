import { ZodIssue } from "zod";
import { NotFoundError } from "../../errors/not_found_error";
import { RequestValidationError } from "../../errors/request_validation_error";
import {
  findRuleViolations,
  isSettingKey,
  settingDefinitions,
  settingKeys,
  type SettingKey,
} from "../../settings/definitions";
import {
  mergeOverrides,
  refreshAndPublishSettings,
  resolveSettings,
} from "../../settings/store";
import {
  deleteSettingOverride,
  findAllSettingOverrides,
  upsertSettingOverrides,
} from "./db";

export const listSettings = async () => {
  const overrides = await findAllSettingOverrides();
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

// Validates every change and the merged result before writing, so a partial
// update can never leave settings inconsistent.
export const updateSettings = async (
  changes: Record<string, unknown>,
  adminId: number,
) => {
  const { parsed, issues } = parseSettingChanges(changes);
  if (issues.length > 0) {
    throw new RequestValidationError(issues);
  }

  const current = await findAllSettingOverrides();
  const merged = mergeOverrides([...current, ...parsed]);
  const violations = findRuleViolations(merged);
  if (violations.length > 0) {
    throw new RequestValidationError(
      violations.flatMap(({ keys, message }) => {
        const changedKeys = keys.filter((key) => key in changes);
        return (changedKeys.length > 0 ? changedKeys : keys).map((key) => ({
          code: "custom" as const,
          message,
          path: [key],
        }));
      }),
    );
  }

  await upsertSettingOverrides(parsed, adminId);
  await refreshAndPublishSettings();

  return listSettings();
};

export const resetSetting = async (key: string) => {
  if (!isSettingKey(key)) {
    throw new NotFoundError("Setting not found");
  }

  const current = await findAllSettingOverrides();
  const merged = mergeOverrides(current.filter((row) => row.key !== key));
  const violations = findRuleViolations(merged);
  if (violations.length > 0) {
    throw new RequestValidationError(
      violations.map(({ message }) => ({
        code: "custom",
        message: `Resetting would break a rule: ${message}`,
        path: [key],
      })),
    );
  }

  const version = await deleteSettingOverride(key);
  if (version !== null) {
    await refreshAndPublishSettings();
  }

  return listSettings();
};

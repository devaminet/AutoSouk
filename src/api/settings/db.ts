import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { appSettingsTable } from "../../db/schema/app_settings";

export const findAllSettingOverrides = async () => {
  return await db
    .select({
      key: appSettingsTable.key,
      value: appSettingsTable.value,
      updatedBy: appSettingsTable.updatedBy,
      updatedAt: appSettingsTable.updatedAt,
    })
    .from(appSettingsTable);
};

export const upsertSettingOverrides = async (
  overrides: { key: string; value: unknown }[],
  updatedBy: number,
) => {
  if (overrides.length === 0) {
    return;
  }

  await db
    .insert(appSettingsTable)
    .values(overrides.map(({ key, value }) => ({ key, value, updatedBy })))
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: {
        value: sql`excluded.value`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`now()`,
      },
    });
};

// Returns false when the setting had no override.
export const deleteSettingOverride = async (key: string) => {
  const deleted = await db
    .delete(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .returning({ key: appSettingsTable.key });

  return deleted.length > 0;
};

import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  appSettingsTable,
  appSettingsVersionTable,
} from "../../db/schema/app_settings";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

// Version 0 means no settings write has happened yet.
const findSettingsVersion = async (executor: Transaction) => {
  const [row] = await executor
    .select({ version: appSettingsVersionTable.version })
    .from(appSettingsVersionTable);

  return row?.version ?? 0;
};

// Reads the version and the overrides from one consistent snapshot, so the
// pair always matches even while another write commits.
export const findSettingsState = async () => {
  return await db.transaction(
    async (tx) => {
      const version = await findSettingsVersion(tx);
      const overrides = await tx
        .select({ key: appSettingsTable.key, value: appSettingsTable.value })
        .from(appSettingsTable);
      return { version, overrides };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
};

const bumpSettingsVersion = async (tx: Transaction) => {
  const [row] = await tx
    .insert(appSettingsVersionTable)
    .values({ id: 1, version: 1 })
    .onConflictDoUpdate({
      target: appSettingsVersionTable.id,
      set: { version: sql`${appSettingsVersionTable.version} + 1` },
    })
    .returning({ version: appSettingsVersionTable.version });

  return row.version;
};

// Returns the new settings version.
export const upsertSettingOverrides = async (
  overrides: { key: string; value: unknown }[],
  updatedBy: number,
) => {
  return await db.transaction(async (tx) => {
    const version = await bumpSettingsVersion(tx);
    await tx
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
    return version;
  });
};

// Returns the new settings version, or null when the setting had no
// override (nothing changed, so the version is not bumped).
export const deleteSettingOverride = async (key: string) => {
  return await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(appSettingsTable)
      .where(eq(appSettingsTable.key, key))
      .returning({ key: appSettingsTable.key });

    if (deleted.length === 0) {
      return null;
    }
    return await bumpSettingsVersion(tx);
  });
};

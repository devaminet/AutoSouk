import { sql } from "drizzle-orm";
import { db } from "../../db";
import {
  appSettingsTable,
  appSettingsVersionTable,
} from "../../db/schema/app_settings";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const overrideColumns = {
  key: appSettingsTable.key,
  value: appSettingsTable.value,
  updatedBy: appSettingsTable.updatedBy,
  updatedAt: appSettingsTable.updatedAt,
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
      const overrides = await tx.select(overrideColumns).from(appSettingsTable);
      return { version, overrides };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
};

// The new version is above both the current one and the given floor.
const bumpSettingsVersion = async (tx: Transaction, floor = 0) => {
  const [row] = await tx
    .insert(appSettingsVersionTable)
    .values({ id: 1, version: floor + 1 })
    .onConflictDoUpdate({
      target: appSettingsVersionTable.id,
      set: {
        version: sql`greatest(${appSettingsVersionTable.version}, ${floor}) + 1`,
      },
    })
    .returning({ version: appSettingsVersionTable.version });

  return row.version;
};

// Locks the version row until commit, so settings writes run one at a time
// and each one sees every write committed before it.
const lockSettingsVersion = async (tx: Transaction) => {
  await tx
    .insert(appSettingsVersionTable)
    .values({ id: 1, version: 0 })
    .onConflictDoNothing({ target: appSettingsVersionTable.id });

  const [row] = await tx
    .select({ version: appSettingsVersionTable.version })
    .from(appSettingsVersionTable)
    .for("update");

  return row.version;
};

const createSettingsWriter = (tx: Transaction, version: number) => ({
  version,
  findOverrides: () => tx.select(overrideColumns).from(appSettingsTable),
  upsertOverrides: async (
    overrides: { key: string; value: unknown }[],
    updatedBy: number,
  ) => {
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
  },
  insertMissing: async (rows: { key: string; value: unknown }[]) => {
    if (rows.length === 0) {
      return 0;
    }
    const inserted = await tx
      .insert(appSettingsTable)
      .values(rows)
      .onConflictDoNothing({ target: appSettingsTable.key })
      .returning({ key: appSettingsTable.key });
    return inserted.length;
  },
  bumpVersion: (floor?: number) => bumpSettingsVersion(tx, floor),
});

export type SettingsWriter = ReturnType<typeof createSettingsWriter>;

// Runs the callback in one transaction holding the settings write lock.
// Throwing from the callback rolls back everything it wrote.
export const withSettingsWriteLock = async <T>(
  callback: (writer: SettingsWriter) => Promise<T>,
) => {
  return await db.transaction(async (tx) => {
    const version = await lockSettingsVersion(tx);
    return await callback(createSettingsWriter(tx, version));
  });
};

// Inserts a row for every setting that has none, leaving existing rows (and
// so admin changes) untouched. Bumps the version only when rows were added.
// Returns the number of rows inserted.
export const insertMissingSettingDefaults = async (
  defaults: { key: string; value: unknown }[],
) => {
  return await withSettingsWriteLock(async (writer) => {
    const inserted = await writer.insertMissing(defaults);
    if (inserted > 0) {
      await writer.bumpVersion();
    }
    return inserted;
  });
};

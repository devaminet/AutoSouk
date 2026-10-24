import { relations, sql } from "drizzle-orm";
import {
  bigint,
  check,
  integer,
  jsonb,
  pgTable,
  smallint,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

// One row per setting. The seed inserts code defaults from
// src/settings/definitions.ts for missing keys and never overwrites a row, so
// admin changes survive. A setting without a row (or with an invalid value)
// uses its code default.
export const appSettingsTable = pgTable("app_settings", {
  key: varchar({ length: 100 }).primaryKey(),
  value: jsonb().notNull(),
  updatedBy: integer("updated_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const appSettingsRelations = relations(appSettingsTable, ({ one }) => ({
  updatedByUser: one(usersTable, {
    fields: [appSettingsTable.updatedBy],
    references: [usersTable.id],
  }),
}));

// Single row holding the settings version. Every write bumps it in the same
// transaction, so a version always matches the overrides committed with it.
// The row lock taken by the bump also serializes concurrent settings writes.
export const appSettingsVersionTable = pgTable(
  "app_settings_version",
  {
    id: smallint().primaryKey().default(1),
    version: bigint({ mode: "number" }).notNull(),
  },
  (table) => [check("app_settings_version_single_row", sql`${table.id} = 1`)],
);

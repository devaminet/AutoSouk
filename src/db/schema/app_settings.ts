import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

// Stores admin overrides only. Settings without a row use the default from
// src/settings/definitions.ts, so new settings need no migration or seed.
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

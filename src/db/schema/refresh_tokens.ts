import { foreignKey, integer, pgTable, text } from "drizzle-orm/pg-core";
import { usersTable } from "./user";
import { userDevicesTable } from "./user_device";

export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    currentToken: text("current_token"),
    lastToken: text("last_token"),
    // The device this session belongs to. Signing the device out deletes it.
    deviceId: integer("device_id").references(() => userDevicesTable.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    foreignKey({
      name: "user_fk",
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete("cascade"),
  ]
);

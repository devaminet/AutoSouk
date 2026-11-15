import { foreignKey, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
    // The device this session belongs to. Deleting the device deletes it.
    deviceId: integer("device_id").references(() => userDevicesTable.id, {
      onDelete: "cascade",
    }),
    // When the refresh token in use stops working. Older rows have none.
    expiresAt: timestamp("expires_at"),
    // Set on logout. The row stays, so a request still holding its token is
    // refused quietly instead of looking like a stolen token.
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    foreignKey({
      name: "user_fk",
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete("cascade"),
  ]
);

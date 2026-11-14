import {
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

// A browser or phone the user signed in on. The device keeps a random token
// in a long-lived cookie; only its hash is stored. Signing a device out sets
// revokedAt and ends its sessions.
export const userDevicesTable = pgTable(
  "user_devices",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    // Such as "Chrome on Windows".
    label: varchar({ length: 120 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [index("user_devices_user_id_idx").on(table.userId)],
);

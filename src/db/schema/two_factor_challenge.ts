import {
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

// A sign-in on a new device that waits for the code texted to the user.
// The client holds the challenge token; only hashes are stored.
export const twoFactorChallengesTable = pgTable(
  "two_factor_challenges",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    // When the code was last texted, for the resend cooldown.
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("two_factor_challenges_user_id_idx").on(table.userId)],
);

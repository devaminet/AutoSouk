import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

export const identityVerificationStatusEnum = pgEnum(
  "identity_verification_status",
  ["started", "pending", "approved", "rejected"],
);

// One face video and the challenges asked in it. The video is deleted once an
// admin decides; the row stays as a record of the decision.
export const identityVerificationsTable = pgTable(
  "identity_verifications",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: identityVerificationStatusEnum("status")
      .notNull()
      .default("started"),
    challenges: jsonb().$type<string[]>().notNull(),
    videoName: varchar("video_name").notNull(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    submittedAt: timestamp("submitted_at"),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    videoDeletedAt: timestamp("video_deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("identity_verifications_user_id_idx").on(table.userId),
    index("identity_verifications_status_idx").on(table.status),
  ],
);

export const identityVerificationRelations = relations(
  identityVerificationsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [identityVerificationsTable.userId],
      references: [usersTable.id],
    }),
  }),
);

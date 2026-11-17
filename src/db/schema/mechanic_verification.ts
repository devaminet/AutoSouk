import { relations } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

export const mechanicKindEnum = pgEnum("mechanic_kind", ["solo", "garage"]);

export const mechanicDocumentTypeEnum = pgEnum("mechanic_document_type", [
  "cin_front",
  "cin_back",
  "rc",
  "patente",
  "ice",
  "premises",
]);

// uploading: the upload link was given out. uploaded: the file is stored,
// not yet sent. pending: sent, waiting for an admin. replaced: a newer
// approved document of the same type took its place.
export const mechanicDocumentStatusEnum = pgEnum("mechanic_document_status", [
  "uploading",
  "uploaded",
  "pending",
  "approved",
  "rejected",
  "replaced",
]);

// How a mechanic works, and whether buyers can book them. A mechanic is
// bookable from approvedAt, while every required document is approved, until
// validUntil, the first expiry date among those documents.
export const mechanicVerificationsTable = pgTable("mechanic_verifications", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  kind: mechanicKindEnum("kind").notNull(),
  approvedAt: timestamp("approved_at"),
  validUntil: date("valid_until", { mode: "string" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// One uploaded file. Files of rejected and replaced documents are deleted;
// the row stays as a record of the decision.
export const mechanicDocumentsTable = pgTable(
  "mechanic_documents",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: mechanicDocumentTypeEnum("type").notNull(),
    status: mechanicDocumentStatusEnum("status").notNull().default("uploading"),
    fileName: varchar("file_name").notNull(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    validUntil: date("valid_until", { mode: "string" }),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    submittedAt: timestamp("submitted_at"),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    fileDeletedAt: timestamp("file_deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("mechanic_documents_user_id_idx").on(table.userId),
    index("mechanic_documents_status_idx").on(table.status),
  ],
);

export const mechanicVerificationRelations = relations(
  mechanicVerificationsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [mechanicVerificationsTable.userId],
      references: [usersTable.id],
    }),
  }),
);

export const mechanicDocumentRelations = relations(
  mechanicDocumentsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [mechanicDocumentsTable.userId],
      references: [usersTable.id],
    }),
  }),
);

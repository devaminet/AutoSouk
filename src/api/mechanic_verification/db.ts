import { and, asc, eq, inArray, isNotNull, isNull, min, ne, or, sql, count } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { db } from "../../db";
import { auditLogTable } from "../../db/schema/audit_log";
import { cityTable } from "../../db/schema/city";
import { mechanicTable } from "../../db/schema/mechanic";
import {
  mechanicDocumentsTable,
  mechanicVerificationsTable,
} from "../../db/schema/mechanic_verification";
import { usersTable } from "../../db/schema/user";
import { mechanicDocumentTypes, mechanicKinds } from "../../utils/constants";
import type { Transaction } from "../identity/db";

export type MechanicKind = (typeof mechanicKinds)[number];
export type MechanicDocumentType = (typeof mechanicDocumentTypes)[number];
export type MechanicDocument = typeof mechanicDocumentsTable.$inferSelect;

// Today's date as Postgres writes a date, in UTC.
export const today = () => new Date().toISOString().slice(0, 10);

// Whether buyers can book the mechanic with this user id: every required
// document approved, none of them expired, the face check approved, and the
// account not suspended.
// Used inside other queries. The inner columns are written out, as relational
// queries would otherwise rename them after the outer table's alias.
export const isBookableMechanic = (userId: AnyColumn) =>
  sql<boolean>`exists (
    select 1 from "mechanic_verifications" "mv"
    join "users" "mu" on "mu"."id" = "mv"."user_id"
    where "mv"."user_id" = ${userId}
      and "mv"."approved_at" is not null
      and ("mv"."valid_until" is null or "mv"."valid_until" >= current_date)
      and "mu"."suspended_at" is null
      and "mu"."identity_status" = 'approved'
  )`;

export const isMechanicUserBookable = async (userId: number) => {
  const [row] = await db
    .select({ bookable: isBookableMechanic(usersTable.id) })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return row?.bookable === true;
};

export const findVerification = async (userId: number) => {
  const [verification] = await db
    .select()
    .from(mechanicVerificationsTable)
    .where(eq(mechanicVerificationsTable.userId, userId));
  return verification ?? null;
};

export const saveKind = async (userId: number, kind: MechanicKind) => {
  await db
    .insert(mechanicVerificationsTable)
    .values({ userId, kind })
    .onConflictDoUpdate({
      target: mechanicVerificationsTable.userId,
      set: { kind, updatedAt: new Date() },
    });
};

// The user's documents, except links given out but never used and documents
// a newer one replaced, oldest first.
export const findDocuments = async (userId: number) =>
  db
    .select()
    .from(mechanicDocumentsTable)
    .where(
      and(
        eq(mechanicDocumentsTable.userId, userId),
        inArray(mechanicDocumentsTable.status, ["uploaded", "pending", "approved", "rejected"]),
      ),
    )
    .orderBy(asc(mechanicDocumentsTable.createdAt), asc(mechanicDocumentsTable.id));

export const findDocumentById = async (id: number) => {
  const [document] = await db
    .select()
    .from(mechanicDocumentsTable)
    .where(eq(mechanicDocumentsTable.id, id));
  return document ?? null;
};

// The documents of this type not sent yet: a new upload takes their place.
export const findDrafts = async (userId: number, type: MechanicDocumentType) =>
  db
    .select()
    .from(mechanicDocumentsTable)
    .where(
      and(
        eq(mechanicDocumentsTable.userId, userId),
        eq(mechanicDocumentsTable.type, type),
        inArray(mechanicDocumentsTable.status, ["uploading", "uploaded"]),
      ),
    );

export const deleteDocuments = async (ids: number[]) => {
  if (ids.length > 0) {
    await db.delete(mechanicDocumentsTable).where(inArray(mechanicDocumentsTable.id, ids));
  }
};

export const insertDocument = async (data: {
  userId: number;
  type: MechanicDocumentType;
  fileName: string;
  contentType: string;
}) => {
  const [document] = await db.insert(mechanicDocumentsTable).values(data).returning();
  return document;
};

// Marks an upload as stored. Returns null when it wasn't waiting for its file.
export const markUploaded = async (id: number, userId: number, sizeBytes: number) => {
  const [document] = await db
    .update(mechanicDocumentsTable)
    .set({ status: "uploaded", sizeBytes })
    .where(
      and(
        eq(mechanicDocumentsTable.id, id),
        eq(mechanicDocumentsTable.userId, userId),
        eq(mechanicDocumentsTable.status, "uploading"),
      ),
    )
    .returning();
  return document ?? null;
};

// Sends every stored document of the user to review.
export const submitUploaded = async (userId: number) =>
  db
    .update(mechanicDocumentsTable)
    .set({ status: "pending", submittedAt: new Date() })
    .where(
      and(
        eq(mechanicDocumentsTable.userId, userId),
        eq(mechanicDocumentsTable.status, "uploaded"),
      ),
    )
    .returning();

// The mechanics with documents waiting for review, longest waiting first.
export const findPendingReviews = async () =>
  db
    .select({
      userId: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      kind: mechanicVerificationsTable.kind,
      approvedAt: mechanicVerificationsTable.approvedAt,
      mechanicName: mechanicTable.name,
      cityName: cityTable.name,
      pendingCount: count(mechanicDocumentsTable.id),
      submittedAt: min(mechanicDocumentsTable.submittedAt),
    })
    .from(mechanicDocumentsTable)
    .innerJoin(usersTable, eq(usersTable.id, mechanicDocumentsTable.userId))
    .leftJoin(mechanicVerificationsTable, eq(mechanicVerificationsTable.userId, usersTable.id))
    .leftJoin(mechanicTable, eq(mechanicTable.userId, usersTable.id))
    .leftJoin(cityTable, eq(cityTable.id, mechanicTable.cityId))
    .where(eq(mechanicDocumentsTable.status, "pending"))
    .groupBy(
      usersTable.id,
      mechanicVerificationsTable.kind,
      mechanicVerificationsTable.approvedAt,
      mechanicTable.name,
      cityTable.name,
    )
    .orderBy(asc(min(mechanicDocumentsTable.submittedAt)))
    .limit(100);

// Whether the user had documents decided before: a mechanic sending again.
export const hasReviewedDocuments = async (userId: number) => {
  const [row] = await db
    .select({ id: mechanicDocumentsTable.id })
    .from(mechanicDocumentsTable)
    .where(
      and(eq(mechanicDocumentsTable.userId, userId), isNotNull(mechanicDocumentsTable.reviewedAt)),
    )
    .limit(1);
  return Boolean(row);
};

export type DocumentDecision = {
  documentId: number;
  decision: "approved" | "rejected";
  reason: string | null;
  validUntil: string | null;
};

// The approved documents that make the mechanic bookable, and until when.
const approvalOf = (
  kindRequired: readonly MechanicDocumentType[],
  approved: { type: MechanicDocumentType; validUntil: string | null }[],
) => {
  const complete = kindRequired.every((type) => approved.some((doc) => doc.type === type));
  if (!complete) {
    return null;
  }
  const dates = approved
    .filter((doc) => kindRequired.includes(doc.type) && doc.validUntil)
    .map((doc) => doc.validUntil as string)
    .sort();
  return { validUntil: dates[0] ?? null };
};

// Saves an admin's decisions on the user's pending documents, with the audit
// entries and the mechanic's new standing, in one transaction. An approved
// document replaces the older approved one of its type. Returns the files to
// delete, or null when a document was no longer pending.
export const saveDecisions = async (
  data: {
    userId: number;
    adminId: number;
    decisions: DocumentDecision[];
    required: (kind: MechanicKind) => readonly MechanicDocumentType[];
  },
  // The caller's transaction, to save these with other decisions.
  outer?: Transaction,
) => {
  const run = async (tx: Transaction) => {
    const reviewedAt = new Date();
    const filesToDelete: { id: number; fileName: string }[] = [];
    for (const decision of data.decisions) {
      const [document] = await tx
        .update(mechanicDocumentsTable)
        .set({
          status: decision.decision,
          validUntil: decision.decision === "approved" ? decision.validUntil : null,
          rejectionReason: decision.decision === "rejected" ? decision.reason : null,
          reviewedBy: data.adminId,
          reviewedAt,
        })
        .where(
          and(
            eq(mechanicDocumentsTable.id, decision.documentId),
            eq(mechanicDocumentsTable.userId, data.userId),
            eq(mechanicDocumentsTable.status, "pending"),
          ),
        )
        .returning();
      if (!document) {
        tx.rollback();
      }
      if (decision.decision === "rejected") {
        filesToDelete.push(document);
      } else {
        const replaced = await tx
          .update(mechanicDocumentsTable)
          .set({ status: "replaced" })
          .where(
            and(
              eq(mechanicDocumentsTable.userId, data.userId),
              eq(mechanicDocumentsTable.type, document.type),
              eq(mechanicDocumentsTable.status, "approved"),
              ne(mechanicDocumentsTable.id, document.id),
            ),
          )
          .returning();
        filesToDelete.push(...replaced);
      }
      await tx.insert(auditLogTable).values({
        actorUserId: data.adminId,
        action: `mechanic_document.${decision.decision}`,
        targetType: "mechanic_document",
        targetId: document.id,
        details: {
          ...(decision.reason ? { reason: decision.reason } : {}),
          ...(decision.validUntil ? { validUntil: decision.validUntil } : {}),
        },
      });
    }

    const [verification] = await tx
      .select()
      .from(mechanicVerificationsTable)
      .where(eq(mechanicVerificationsTable.userId, data.userId));
    const approved = await tx
      .select({ type: mechanicDocumentsTable.type, validUntil: mechanicDocumentsTable.validUntil })
      .from(mechanicDocumentsTable)
      .where(
        and(
          eq(mechanicDocumentsTable.userId, data.userId),
          eq(mechanicDocumentsTable.status, "approved"),
        ),
      );
    const approval = verification ? approvalOf(data.required(verification.kind), approved) : null;
    const [updated] = await tx
      .update(mechanicVerificationsTable)
      .set({
        approvedAt: approval ? (verification?.approvedAt ?? reviewedAt) : null,
        validUntil: approval?.validUntil ?? null,
        updatedAt: reviewedAt,
      })
      .where(eq(mechanicVerificationsTable.userId, data.userId))
      .returning();
    return { filesToDelete, verification: updated ?? null };
  };
  return outer ? run(outer) : db.transaction(run);
};

// The pending documents decided by nobody yet, for the admin's check that a
// decision covers each of them.
export const findPendingDocuments = async (userId: number) =>
  db
    .select()
    .from(mechanicDocumentsTable)
    .where(
      and(eq(mechanicDocumentsTable.userId, userId), eq(mechanicDocumentsTable.status, "pending")),
    );

export const markFilesDeleted = async (ids: number[]) => {
  if (ids.length > 0) {
    await db
      .update(mechanicDocumentsTable)
      .set({ fileDeletedAt: new Date() })
      .where(
        and(inArray(mechanicDocumentsTable.id, ids), isNull(mechanicDocumentsTable.fileDeletedAt)),
      );
  }
};

export const insertAuditEntry = async (entry: {
  actorUserId: number;
  action: string;
  targetType: string;
  targetId: number;
}) => {
  await db.insert(auditLogTable).values(entry);
};

// The mechanic's profile and checks, for the admin's review page.
export const findReviewSubject = async (userId: number) => {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phoneVerifiedAt: true,
      identityStatus: true,
      createdAt: true,
    },
    with: { role: { columns: { name: true } } },
  });
  if (!user) {
    return null;
  }
  const [mechanic] = await db
    .select({ id: mechanicTable.id, name: mechanicTable.name, address: mechanicTable.address, city: cityTable.name })
    .from(mechanicTable)
    .leftJoin(cityTable, eq(cityTable.id, mechanicTable.cityId))
    .where(eq(mechanicTable.userId, userId));
  return { user, mechanic: mechanic ?? null };
};

// Approved documents still in use, for a mechanic changing nothing else.
export const hasPendingOrApproved = async (userId: number) => {
  const [row] = await db
    .select({ id: mechanicDocumentsTable.id })
    .from(mechanicDocumentsTable)
    .where(
      and(
        eq(mechanicDocumentsTable.userId, userId),
        or(
          eq(mechanicDocumentsTable.status, "pending"),
          eq(mechanicDocumentsTable.status, "approved"),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
};

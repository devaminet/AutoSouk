import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { auditLogTable } from "../../db/schema/audit_log";
import { identityVerificationsTable } from "../../db/schema/identity_verification";
import { usersTable } from "../../db/schema/user";

type Decision = "approved" | "rejected";

export const countRejectedIdentityChecks = async (userId: number) => {
  const [result] = await db
    .select({ total: count() })
    .from(identityVerificationsTable)
    .where(
      and(
        eq(identityVerificationsTable.userId, userId),
        eq(identityVerificationsTable.status, "rejected"),
      ),
    );
  return result?.total ?? 0;
};

export const insertIdentityCheck = async (data: {
  userId: number;
  challenges: string[];
  videoName: string;
  contentType: string;
}) => {
  const [check] = await db
    .insert(identityVerificationsTable)
    .values(data)
    .returning();
  return check;
};

export const findIdentityCheckById = async (id: number) => {
  const check = await db.query.identityVerificationsTable.findFirst({
    where: eq(identityVerificationsTable.id, id),
  });
  return check ?? null;
};

// The user's last decided check, for the reason of a rejection.
export const findLatestDecidedIdentityCheck = async (userId: number) => {
  const check = await db.query.identityVerificationsTable.findFirst({
    where: and(
      eq(identityVerificationsTable.userId, userId),
      inArray(identityVerificationsTable.status, ["approved", "rejected"]),
    ),
    orderBy: desc(identityVerificationsTable.reviewedAt),
  });
  return check ?? null;
};

// Sends a started check to review. Returns null when it was no longer
// started.
export const markIdentityCheckSubmitted = async (id: number, userId: number) =>
  db.transaction(async (tx) => {
    const [check] = await tx
      .update(identityVerificationsTable)
      .set({ status: "pending", submittedAt: new Date() })
      .where(
        and(
          eq(identityVerificationsTable.id, id),
          eq(identityVerificationsTable.userId, userId),
          eq(identityVerificationsTable.status, "started"),
        ),
      )
      .returning();
    if (!check) {
      return null;
    }
    await tx
      .update(usersTable)
      .set({ identityStatus: "pending" })
      .where(eq(usersTable.id, userId));
    return check;
  });

export const findIdentityChecksByStatus = async (
  status: "pending" | Decision,
) =>
  db.query.identityVerificationsTable.findMany({
    where: eq(identityVerificationsTable.status, status),
    orderBy:
      status === "pending"
        ? asc(identityVerificationsTable.submittedAt)
        : desc(identityVerificationsTable.reviewedAt),
    with: {
      user: {
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        with: { role: { columns: { name: true } } },
      },
    },
    limit: 100,
  });

// Records the admin's decision on a pending check, the user's new status and
// the audit entry together. Returns null when the check wasn't pending.
export const decideIdentityCheck = async (data: {
  id: number;
  adminId: number;
  decision: Decision;
  reason: string | null;
}) =>
  db.transaction(async (tx) => {
    const [check] = await tx
      .update(identityVerificationsTable)
      .set({
        status: data.decision,
        reviewedBy: data.adminId,
        reviewedAt: new Date(),
        rejectionReason: data.decision === "rejected" ? data.reason : null,
      })
      .where(
        and(
          eq(identityVerificationsTable.id, data.id),
          eq(identityVerificationsTable.status, "pending"),
        ),
      )
      .returning();
    if (!check) {
      return null;
    }
    await tx
      .update(usersTable)
      .set({ identityStatus: data.decision })
      .where(eq(usersTable.id, check.userId));
    await tx.insert(auditLogTable).values({
      actorUserId: data.adminId,
      action: `identity.${data.decision}`,
      targetType: "identity_verification",
      targetId: check.id,
      details: data.reason ? { reason: data.reason } : null,
    });
    return check;
  });

export const markIdentityVideoDeleted = async (id: number) => {
  await db
    .update(identityVerificationsTable)
    .set({ videoDeletedAt: new Date() })
    .where(eq(identityVerificationsTable.id, id));
};

export const insertAuditEntries = async (
  entries: {
    actorUserId: number;
    action: string;
    targetType: string;
    targetId: number;
  }[],
) => {
  if (entries.length > 0) {
    await db.insert(auditLogTable).values(entries);
  }
};

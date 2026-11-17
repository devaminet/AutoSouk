import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { identityVerificationsTable } from "../../db/schema/identity_verification";
import { mechanicTable } from "../../db/schema/mechanic";
import { mechanicVerificationsTable } from "../../db/schema/mechanic_verification";
import { rolesTable } from "../../db/schema/roles";
import { usersTable } from "../../db/schema/user";

// When the user's face video was sent, while it waits for review.
const faceCheckSince = sql<string | null>`(
  select min("iv"."submitted_at") from "identity_verifications" "iv"
  where "iv"."user_id" = ${usersTable.id} and "iv"."status" = 'pending'
)`;

// When the oldest document waiting for review was sent.
const documentsSince = sql<string | null>`(
  select min("md"."submitted_at") from "mechanic_documents" "md"
  where "md"."user_id" = ${usersTable.id} and "md"."status" = 'pending'
)`;

const pendingDocuments = sql<number>`(
  select count(*)::int from "mechanic_documents" "md"
  where "md"."user_id" = ${usersTable.id} and "md"."status" = 'pending'
)`;

// The user was asked to send something again before.
const resent = sql<boolean>`(
  exists (
    select 1 from "identity_verifications" "iv"
    where "iv"."user_id" = ${usersTable.id} and "iv"."status" = 'rejected'
  ) or exists (
    select 1 from "mechanic_documents" "md"
    where "md"."user_id" = ${usersTable.id} and "md"."status" = 'rejected'
  )
)`;

// Everyone with something waiting for an admin: a face video, documents, or
// both. The longest waiting first.
export const findVerificationQueue = async () => {
  const since = sql<string>`least(${faceCheckSince}, ${documentsSince})`;
  const rows = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: rolesTable.name,
      faceCheckSince,
      documentsSince,
      pendingDocuments,
      resent,
      kind: mechanicVerificationsTable.kind,
      mechanicName: mechanicTable.name,
      since,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId))
    .leftJoin(mechanicVerificationsTable, eq(mechanicVerificationsTable.userId, usersTable.id))
    .leftJoin(mechanicTable, eq(mechanicTable.userId, usersTable.id))
    .where(sql`${faceCheckSince} is not null or ${documentsSince} is not null`)
    .orderBy(since, usersTable.id)
    .limit(200);
  return rows;
};

export const findPendingFaceCheck = async (userId: number) => {
  const [check] = await db
    .select()
    .from(identityVerificationsTable)
    .where(
      and(
        eq(identityVerificationsTable.userId, userId),
        eq(identityVerificationsTable.status, "pending"),
      ),
    )
    .orderBy(desc(identityVerificationsTable.submittedAt))
    .limit(1);
  return check ?? null;
};

// The user's decided face checks, newest first.
export const findDecidedFaceChecks = async (userId: number) =>
  db
    .select({
      id: identityVerificationsTable.id,
      status: identityVerificationsTable.status,
      submittedAt: identityVerificationsTable.submittedAt,
      reviewedAt: identityVerificationsTable.reviewedAt,
      rejectionReason: identityVerificationsTable.rejectionReason,
    })
    .from(identityVerificationsTable)
    .where(
      and(
        eq(identityVerificationsTable.userId, userId),
        inArray(identityVerificationsTable.status, ["approved", "rejected"]),
      ),
    )
    .orderBy(desc(identityVerificationsTable.reviewedAt));

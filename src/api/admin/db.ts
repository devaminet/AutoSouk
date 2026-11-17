import { and, asc, count, countDistinct, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { auditLogTable } from "../../db/schema/audit_log";
import { carTable } from "../../db/schema/car";
import { carMediaTable } from "../../db/schema/car_media";
import { makeTable as carMakeTable } from "../../db/schema/car_make";
import { carModelTable } from "../../db/schema/car_model";
import { cityTable } from "../../db/schema/city";
import { identityVerificationsTable } from "../../db/schema/identity_verification";
import { inspectionTable } from "../../db/schema/inspection";
import { listingTable } from "../../db/schema/listing";
import { mechanicTable } from "../../db/schema/mechanic";
import { mechanicGarageImageTable } from "../../db/schema/mechanic_garage_image";
import { mechanicReviewTable } from "../../db/schema/mechanic_review";
import { mechanicDocumentsTable } from "../../db/schema/mechanic_verification";
import { rolesTable } from "../../db/schema/roles";
import { usersTable } from "../../db/schema/user";
import {
  carBucketName,
  identityBucketName,
  inspectionReportsBucketName,
  mechanicDocumentsBucketName,
  mechanicsBucketName,
  usersBucketName,
} from "../../utils/constants";
import { cancelActiveInspectionsOfCars } from "../inspections/db";
import { isBookableMechanic } from "../mechanic_verification/db";
import {
  adminAuditLogQuerySchema,
  adminInspectionsQuerySchema,
  adminListingsQuerySchema,
  adminMechanicsQuerySchema,
  adminUsersQuerySchema,
} from "./request_schema";

// A file to remove from storage once its rows are gone.
export type StoredFile = { bucket: string; name: string };

const pageOf = ({ page, limit }: { page: number; limit: number }) => ({
  limit,
  offset: (page - 1) * limit,
});

// `%term%`, with the wildcards the admin typed taken literally.
const containing = (term: string) => `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const fullName = sql<string>`${usersTable.firstName} || ' ' || ${usersTable.lastName}`;

// Counts grouped by a column, as a list of rows.
const grouped = <T>(rows: { key: T | null; total: number }[]) =>
  rows.flatMap(({ key, total }) => (key === null ? [] : [{ key, total }]));

export const countUsersByRole = async () =>
  grouped(
    await db
      .select({ key: rolesTable.name, total: count() })
      .from(usersTable)
      .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId))
      .groupBy(rolesTable.name),
  );

export const countSuspendedUsers = async () => {
  const [row] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(isNotNull(usersTable.suspendedAt));
  return row?.total ?? 0;
};

export const countPendingIdentityChecks = async () => {
  const [row] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.identityStatus, "pending"));
  return row?.total ?? 0;
};

export const countListingsByStatus = async () =>
  grouped(
    await db
      .select({ key: listingTable.status, total: count() })
      .from(listingTable)
      .groupBy(listingTable.status),
  );

export const countInspectionsByStatus = async () =>
  grouped(
    await db
      .select({ key: inspectionTable.status, total: count() })
      .from(inspectionTable)
      .groupBy(inspectionTable.status),
  );

export const countMechanics = async () => {
  const [row] = await db
    .select({
      total: count(),
      bookable: sql<number>`count(*) filter (where ${isBookableMechanic(mechanicTable.userId)})::int`,
    })
    .from(mechanicTable);
  return { total: row?.total ?? 0, bookable: row?.bookable ?? 0 };
};

// People with a face video or documents waiting for an admin.
export const countVerificationQueue = async () => {
  const [row] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(
      sql`exists (
        select 1 from "identity_verifications" "iv"
        where "iv"."user_id" = ${usersTable.id} and "iv"."status" = 'pending'
      ) or exists (
        select 1 from "mechanic_documents" "md"
        where "md"."user_id" = ${usersTable.id} and "md"."status" = 'pending'
      )`,
    );
  return row?.total ?? 0;
};

// Mechanics with at least one document waiting for an admin.
export const countMechanicsAwaitingDocumentReview = async () => {
  const [row] = await db
    .select({ total: countDistinct(mechanicDocumentsTable.userId) })
    .from(mechanicDocumentsTable)
    .where(eq(mechanicDocumentsTable.status, "pending"));
  return row?.total ?? 0;
};

export const findUsers = async (query: z.infer<typeof adminUsersQuerySchema>) => {
  const conditions: SQL[] = [];
  if (query.search) {
    const term = containing(query.search);
    conditions.push(
      or(
        ilike(fullName, term),
        ilike(usersTable.email, term),
        ilike(usersTable.phone, term),
      ) as SQL,
    );
  }
  if (query.role) conditions.push(eq(rolesTable.name, query.role));
  if (query.status === "active") conditions.push(isNull(usersTable.suspendedAt));
  if (query.status === "suspended") conditions.push(isNotNull(usersTable.suspendedAt));
  if (query.identityStatus) conditions.push(eq(usersTable.identityStatus, query.identityStatus));
  const where = and(...conditions);

  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      phone: usersTable.phone,
      role: rolesTable.name,
      emailVerified: usersTable.isVerified,
      phoneVerifiedAt: usersTable.phoneVerifiedAt,
      identityStatus: usersTable.identityStatus,
      suspendedAt: usersTable.suspendedAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId))
    .where(where)
    .orderBy(desc(usersTable.id))
    .limit(pageOf(query).limit)
    .offset(pageOf(query).offset);

  const [row] = await db
    .select({ total: count() })
    .from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId))
    .where(where);

  return { users, total: row?.total ?? 0 };
};

export const findUserForAdmin = async (userId: number) => {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      imageName: true,
      isVerified: true,
      phoneVerifiedAt: true,
      twoFactorEnabled: true,
      identityStatus: true,
      locale: true,
      suspendedAt: true,
      suspensionReason: true,
      createdAt: true,
    },
    with: {
      role: { columns: { name: true } },
      city: { columns: { name: true, slug: true } },
      mechanic: {
        columns: { id: true, name: true, isActive: true, inspectionPrice: true },
        with: { city: { columns: { name: true, slug: true } } },
      },
    },
  });
  return user ?? null;
};

export const countUserListingsByStatus = async (userId: number) =>
  grouped(
    await db
      .select({ key: listingTable.status, total: count() })
      .from(listingTable)
      .where(eq(listingTable.userId, userId))
      .groupBy(listingTable.status),
  );

export const countInspectionsRequestedBy = async (userId: number) => {
  const [row] = await db
    .select({ total: count() })
    .from(inspectionTable)
    .where(eq(inspectionTable.buyerId, userId));
  return row?.total ?? 0;
};

export const countInspectionsByMechanic = async (mechanicId: number) => {
  const [row] = await db
    .select({ total: count() })
    .from(inspectionTable)
    .where(eq(inspectionTable.mechanicId, mechanicId));
  return row?.total ?? 0;
};

// Who did what to the user, newest first.
export const findAuditEntriesAbout = async (targetType: string, targetId: number, limit: number) =>
  db
    .select({
      id: auditLogTable.id,
      action: auditLogTable.action,
      targetType: auditLogTable.targetType,
      targetId: auditLogTable.targetId,
      details: auditLogTable.details,
      createdAt: auditLogTable.createdAt,
      actor: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      },
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogTable.actorUserId))
    .where(and(eq(auditLogTable.targetType, targetType), eq(auditLogTable.targetId, targetId)))
    .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
    .limit(limit);

export const findUserRole = async (userId: number) => {
  const [row] = await db
    .select({ role: rolesTable.name, suspendedAt: usersTable.suspendedAt })
    .from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId))
    .where(eq(usersTable.id, userId));
  return row ?? null;
};

// Suspends the account and records who did it, together. Returns false when
// the account was already suspended.
export const suspendUserById = async (actorUserId: number, userId: number, reason: string) =>
  db.transaction(async (tx) => {
    const [user] = await tx
      .update(usersTable)
      .set({ suspendedAt: new Date(), suspensionReason: reason })
      .where(and(eq(usersTable.id, userId), isNull(usersTable.suspendedAt)))
      .returning({ id: usersTable.id });
    if (!user) {
      return false;
    }
    await tx.insert(auditLogTable).values({
      actorUserId,
      action: "user.suspended",
      targetType: "user",
      targetId: userId,
      details: { reason },
    });
    return true;
  });

// Returns false when the account wasn't suspended.
export const reactivateUserById = async (actorUserId: number, userId: number) =>
  db.transaction(async (tx) => {
    const [user] = await tx
      .update(usersTable)
      .set({ suspendedAt: null, suspensionReason: null })
      .where(and(eq(usersTable.id, userId), isNotNull(usersTable.suspendedAt)))
      .returning({ id: usersTable.id });
    if (!user) {
      return false;
    }
    await tx.insert(auditLogTable).values({
      actorUserId,
      action: "user.reactivated",
      targetType: "user",
      targetId: userId,
    });
    return true;
  });

// Every file the account owns in storage: its profile image, its cars' media,
// its face check videos, its mechanic documents, its garage photos and the
// reports of the inspections it asked for.
export const findUserFiles = async (userId: number): Promise<StoredFile[]> => {
  const [user] = await db
    .select({ imageName: usersTable.imageName, pendingImageName: usersTable.pendingImageName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const carMedia = await db
    .select({ name: carMediaTable.link })
    .from(carMediaTable)
    .innerJoin(carTable, eq(carTable.id, carMediaTable.carId))
    .where(eq(carTable.userId, userId));
  const videos = await db
    .select({ name: identityVerificationsTable.videoName })
    .from(identityVerificationsTable)
    .where(
      and(eq(identityVerificationsTable.userId, userId), isNull(identityVerificationsTable.videoDeletedAt)),
    );
  const documents = await db
    .select({ name: mechanicDocumentsTable.fileName })
    .from(mechanicDocumentsTable)
    .where(and(eq(mechanicDocumentsTable.userId, userId), isNull(mechanicDocumentsTable.fileDeletedAt)));
  const garage = await db
    .select({ profile: mechanicTable.profileImageUrl, image: mechanicGarageImageTable.link })
    .from(mechanicTable)
    .leftJoin(mechanicGarageImageTable, eq(mechanicGarageImageTable.mechanicId, mechanicTable.id))
    .where(eq(mechanicTable.userId, userId));
  // Inspections the user asked for go with them. Those of the user's cars stay,
  // so their buyers keep the reports.
  const reports = await db
    .select({ name: inspectionTable.reportPdfLink })
    .from(inspectionTable)
    .where(and(eq(inspectionTable.buyerId, userId), isNotNull(inspectionTable.reportPdfLink)));

  const files: StoredFile[] = [];
  const add = (bucket: string, name: string | null) => {
    if (name) files.push({ bucket, name });
  };
  add(usersBucketName, user?.imageName ?? null);
  add(usersBucketName, user?.pendingImageName ?? null);
  carMedia.forEach(({ name }) => add(carBucketName, name));
  videos.forEach(({ name }) => add(identityBucketName, name));
  documents.forEach(({ name }) => add(mechanicDocumentsBucketName, name));
  add(mechanicsBucketName, garage[0]?.profile ?? null);
  garage.forEach(({ image }) => add(mechanicsBucketName, image));
  reports.forEach(({ name }) => add(inspectionReportsBucketName, name));
  return files;
};

// Deletes the account. Its rows go with it through the foreign keys, except
// the inspections of its cars, which their buyers keep; those not finished are
// cancelled. The audit log keeps the record of who deleted whom.
export const deleteUserById = async (
  actorUserId: number,
  userId: number,
  details: Record<string, unknown>,
) =>
  db.transaction(async (tx) => {
    const cars = await tx.select({ id: carTable.id }).from(carTable).where(eq(carTable.userId, userId));
    await cancelActiveInspectionsOfCars(tx, cars.map(({ id }) => id));
    await tx.insert(auditLogTable).values({
      actorUserId,
      action: "user.deleted",
      targetType: "user",
      targetId: userId,
      details,
    });
    const [deleted] = await tx
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });
    return Boolean(deleted);
  });

export const findListingsForAdmin = async (query: z.infer<typeof adminListingsQuerySchema>) => {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(listingTable.status, query.status));
  if (query.sellerId) conditions.push(eq(listingTable.userId, query.sellerId));
  if (query.search) {
    const term = containing(query.search);
    conditions.push(
      or(ilike(listingTable.title, term), ilike(fullName, term), ilike(usersTable.email, term)) as SQL,
    );
  }
  const where = and(...conditions);

  const listings = await db
    .select({
      id: listingTable.id,
      title: listingTable.title,
      status: listingTable.status,
      rejectionReason: listingTable.rejectionReason,
      approvedAt: listingTable.approvedAt,
      createdAt: listingTable.createdAt,
      updatedAt: listingTable.updatedAt,
      seller: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        suspendedAt: usersTable.suspendedAt,
      },
      car: {
        id: carTable.id,
        price: carTable.price,
        year: carTable.year,
        make: carMakeTable.name,
        model: carModelTable.name,
        city: cityTable.slug,
      },
    })
    .from(listingTable)
    .leftJoin(usersTable, eq(usersTable.id, listingTable.userId))
    .leftJoin(carTable, eq(carTable.listingId, listingTable.id))
    .leftJoin(carMakeTable, eq(carMakeTable.id, carTable.makeId))
    .leftJoin(carModelTable, eq(carModelTable.id, carTable.modelId))
    .leftJoin(cityTable, eq(cityTable.id, carTable.cityId))
    .where(where)
    .orderBy(desc(listingTable.id))
    .limit(pageOf(query).limit)
    .offset(pageOf(query).offset);

  const [row] = await db
    .select({ total: count() })
    .from(listingTable)
    .leftJoin(usersTable, eq(usersTable.id, listingTable.userId))
    .where(where);

  return { listings, total: row?.total ?? 0 };
};

// The listing's photos and videos, before deleting it. Its car's inspection
// reports stay with their buyers.
export const findListingFiles = async (listingId: number): Promise<StoredFile[]> => {
  const media = await db
    .select({ name: carMediaTable.link })
    .from(carMediaTable)
    .innerJoin(carTable, eq(carTable.id, carMediaTable.carId))
    .where(eq(carTable.listingId, listingId));
  return media.map(({ name }) => ({ bucket: carBucketName, name }));
};

export const findListingOwner = async (listingId: number) => {
  const [row] = await db
    .select({ id: listingTable.id, userId: listingTable.userId, title: listingTable.title })
    .from(listingTable)
    .where(eq(listingTable.id, listingId));
  return row ?? null;
};

// Deletes the listing and its car, with the reason in the audit log. The car's
// inspections stay with their buyers; those not finished are cancelled.
export const deleteListingById = async (actorUserId: number, listingId: number, details: Record<string, unknown>) =>
  db.transaction(async (tx) => {
    const cars = await tx.select({ id: carTable.id }).from(carTable).where(eq(carTable.listingId, listingId));
    await cancelActiveInspectionsOfCars(tx, cars.map(({ id }) => id));
    await tx.insert(auditLogTable).values({
      actorUserId,
      action: "listing.deleted",
      targetType: "listing",
      targetId: listingId,
      details,
    });
    await tx.delete(carTable).where(eq(carTable.listingId, listingId));
    const [deleted] = await tx
      .delete(listingTable)
      .where(eq(listingTable.id, listingId))
      .returning({ id: listingTable.id });
    return Boolean(deleted);
  });

export const findMechanicsForAdmin = async (query: z.infer<typeof adminMechanicsQuerySchema>) => {
  const bookable = isBookableMechanic(mechanicTable.userId);
  const awaitingReview = sql<boolean>`exists (
    select 1 from "mechanic_documents" "md"
    where "md"."user_id" = ${mechanicTable.userId} and "md"."status" = 'pending'
  )`;
  const conditions: SQL[] = [];
  if (query.cityId) conditions.push(eq(mechanicTable.cityId, query.cityId));
  if (query.search) {
    const term = containing(query.search);
    conditions.push(
      or(ilike(mechanicTable.name, term), ilike(fullName, term), ilike(usersTable.email, term)) as SQL,
    );
  }
  if (query.status === "bookable") conditions.push(bookable);
  if (query.status === "not_bookable") conditions.push(sql`not ${bookable}`);
  if (query.status === "awaiting_review") conditions.push(awaitingReview);
  const where = and(...conditions);

  const rating = db
    .select({
      mechanicId: mechanicReviewTable.mechanicId,
      average: sql<number | null>`round(avg(${mechanicReviewTable.rating})::numeric, 1)::float`.as("average"),
      reviews: count().as("reviews"),
    })
    .from(mechanicReviewTable)
    .groupBy(mechanicReviewTable.mechanicId)
    .as("rating");
  const inspections = db
    .select({
      mechanicId: inspectionTable.mechanicId,
      completed: sql<number>`count(*) filter (where ${inspectionTable.status} = 'completed')::int`.as("completed"),
    })
    .from(inspectionTable)
    .groupBy(inspectionTable.mechanicId)
    .as("done");

  const mechanics = await db
    .select({
      id: mechanicTable.id,
      name: mechanicTable.name,
      city: cityTable.slug,
      isActive: mechanicTable.isActive,
      inspectionPrice: mechanicTable.inspectionPrice,
      bookable,
      awaitingReview,
      averageRating: rating.average,
      reviewsCount: sql<number>`coalesce(${rating.reviews}, 0)::int`,
      completedInspections: sql<number>`coalesce(${inspections.completed}, 0)::int`,
      createdAt: mechanicTable.createdAt,
      user: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        suspendedAt: usersTable.suspendedAt,
      },
    })
    .from(mechanicTable)
    .innerJoin(usersTable, eq(usersTable.id, mechanicTable.userId))
    .innerJoin(cityTable, eq(cityTable.id, mechanicTable.cityId))
    .leftJoin(rating, eq(rating.mechanicId, mechanicTable.id))
    .leftJoin(inspections, eq(inspections.mechanicId, mechanicTable.id))
    .where(where)
    .orderBy(desc(mechanicTable.id))
    .limit(pageOf(query).limit)
    .offset(pageOf(query).offset);

  const [row] = await db
    .select({ total: count() })
    .from(mechanicTable)
    .innerJoin(usersTable, eq(usersTable.id, mechanicTable.userId))
    .where(where);

  return { mechanics, total: row?.total ?? 0 };
};

export const findInspectionsForAdmin = async (query: z.infer<typeof adminInspectionsQuerySchema>) => {
  const buyer = sql`"buyer"`;
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(inspectionTable.status, query.status));
  if (query.mechanicId) conditions.push(eq(inspectionTable.mechanicId, query.mechanicId));
  if (query.buyerId) conditions.push(eq(inspectionTable.buyerId, query.buyerId));
  const where = and(...conditions);

  const inspections = await db
    .select({
      id: inspectionTable.id,
      status: inspectionTable.status,
      verdict: inspectionTable.verdict,
      overallScore: inspectionTable.overallScore,
      priceAtRequest: inspectionTable.priceAtRequest,
      requestedAt: inspectionTable.requestedAt,
      acceptedAt: inspectionTable.acceptedAt,
      completedAt: inspectionTable.completedAt,
      hasReport: sql<boolean>`${inspectionTable.reportPdfLink} is not null`,
      buyer: {
        id: sql<number>`${buyer}."id"`,
        firstName: sql<string>`${buyer}."first_name"`,
        lastName: sql<string>`${buyer}."last_name"`,
      },
      mechanic: { id: mechanicTable.id, name: mechanicTable.name },
      // A deleted car keeps the name it had when the buyer asked. Selected
      // flat: Drizzle turns a nested object of a missing join into null.
      carId: inspectionTable.carId,
      carListingId: carTable.listingId,
      carYear: sql<number | null>`coalesce(${carTable.year}, ${inspectionTable.carYear})`,
      carMake: sql<string | null>`coalesce(${carMakeTable.name}, ${inspectionTable.carMake})`,
      carModel: sql<string | null>`coalesce(${carModelTable.name}, ${inspectionTable.carModel})`,
    })
    .from(inspectionTable)
    .innerJoin(sql`"users" ${buyer}`, sql`${buyer}."id" = ${inspectionTable.buyerId}`)
    .innerJoin(mechanicTable, eq(mechanicTable.id, inspectionTable.mechanicId))
    .leftJoin(carTable, eq(carTable.id, inspectionTable.carId))
    .leftJoin(carMakeTable, eq(carMakeTable.id, carTable.makeId))
    .leftJoin(carModelTable, eq(carModelTable.id, carTable.modelId))
    .where(where)
    .orderBy(desc(inspectionTable.requestedAt), desc(inspectionTable.id))
    .limit(pageOf(query).limit)
    .offset(pageOf(query).offset);

  const [row] = await db.select({ total: count() }).from(inspectionTable).where(where);

  return {
    inspections: inspections.map(({ carId, carListingId, carYear, carMake, carModel, ...inspection }) => ({
      ...inspection,
      car: {
        id: carId,
        listingId: carListingId,
        year: carYear,
        make: carMake,
        model: carModel,
        removed: carId === null,
      },
    })),
    total: row?.total ?? 0,
  };
};

export const findAuditLog = async (query: z.infer<typeof adminAuditLogQuerySchema>) => {
  const conditions: SQL[] = [];
  if (query.action) conditions.push(eq(auditLogTable.action, query.action));
  if (query.targetType) conditions.push(eq(auditLogTable.targetType, query.targetType));
  if (query.targetId) conditions.push(eq(auditLogTable.targetId, query.targetId));
  if (query.actorId) conditions.push(eq(auditLogTable.actorUserId, query.actorId));
  const where = and(...conditions);

  const entries = await db
    .select({
      id: auditLogTable.id,
      action: auditLogTable.action,
      targetType: auditLogTable.targetType,
      targetId: auditLogTable.targetId,
      details: auditLogTable.details,
      createdAt: auditLogTable.createdAt,
      actor: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      },
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogTable.actorUserId))
    .where(where)
    .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
    .limit(pageOf(query).limit)
    .offset(pageOf(query).offset);

  const [row] = await db.select({ total: count() }).from(auditLogTable).where(where);

  return { entries, total: row?.total ?? 0 };
};

// The distinct actions in the log, for the filter.
export const findAuditActions = async () =>
  (
    await db
      .selectDistinct({ action: auditLogTable.action })
      .from(auditLogTable)
      .orderBy(asc(auditLogTable.action))
  ).map(({ action }) => action);

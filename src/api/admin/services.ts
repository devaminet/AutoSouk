import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { NotAllowedError } from "../../errors/not_allowed";
import { NotFoundError } from "../../errors/not_found_error";
import { inspectionStatusEnum } from "../../db/schema/inspection";
import { listingStatusEnum } from "../../db/schema/listing";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";
import { getProfileImageUrl, readTemplateFile, removeObject, sendMail } from "../../utils/functions";
import { getMyVerification } from "../mechanic_verification/services";
import { deleteChallenges, endUserSessions, findSignedInDevices } from "../sessions/db";
import { publishDevicesChanged, publishSessionRevoked } from "../sessions/events";
import {
  countInspectionsByMechanic,
  countInspectionsByStatus,
  countInspectionsRequestedBy,
  countListingsByStatus,
  countMechanics,
  countMechanicsAwaitingDocumentReview,
  countPendingIdentityChecks,
  countSuspendedUsers,
  countUserListingsByStatus,
  countUsersByRole,
  countVerificationQueue,
  deleteListingById,
  deleteUserById,
  findAuditActions,
  findAuditEntriesAbout,
  findAuditLog,
  findInspectionsForAdmin,
  findListingFiles,
  findListingOwner,
  findListingsForAdmin,
  findMechanicsForAdmin,
  findUserFiles,
  findUserForAdmin,
  findUserRole,
  findUsers,
  reactivateUserById,
  suspendUserById,
} from "./db";
import type { StoredFile } from "./db";
import {
  adminAuditLogQuerySchema,
  adminInspectionsQuerySchema,
  adminListingsQuerySchema,
  adminMechanicsQuerySchema,
  adminUsersQuerySchema,
} from "./request_schema";

const roles = ["buyer", "seller", "mechanic", "admin"] as const;

// Every key present, with 0 when nothing is counted for it.
const countsOf = <K extends string>(keys: readonly K[], rows: { key: K; total: number }[]) => {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const { key, total } of rows) {
    counts[key] = total;
  }
  return counts;
};

const meta = (total: number, { page, limit }: { page: number; limit: number }) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

// Storage is cleaned after the rows are gone. A failure only leaves an
// orphaned file behind, so it is logged and the request still succeeds.
const removeFiles = async (files: StoredFile[]) => {
  await Promise.all(
    files.map(({ bucket, name }) =>
      removeObject(bucket, name).catch((error: unknown) => {
        console.error(`Could not remove ${bucket}/${name}`, error);
      }),
    ),
  );
};

// What the whole site looks like now, and what waits for an admin.
export const getOverview = async () => {
  const [usersByRole, suspended, listings, inspections, mechanics, identityChecks, mechanicDocuments, verifications] =
    await Promise.all([
      countUsersByRole(),
      countSuspendedUsers(),
      countListingsByStatus(),
      countInspectionsByStatus(),
      countMechanics(),
      countPendingIdentityChecks(),
      countMechanicsAwaitingDocumentReview(),
      countVerificationQueue(),
    ]);
  const byRole = countsOf(
    roles,
    usersByRole.flatMap(({ key, total }) =>
      (roles as readonly string[]).includes(key) ? [{ key: key as (typeof roles)[number], total }] : [],
    ),
  );
  const listingsByStatus = countsOf(listingStatusEnum.enumValues, listings);
  return {
    users: {
      total: Object.values(byRole).reduce((sum, total) => sum + total, 0),
      byRole,
      suspended,
    },
    listings: { byStatus: listingsByStatus },
    mechanics,
    inspections: { byStatus: countsOf(inspectionStatusEnum.enumValues, inspections) },
    queues: {
      verifications,
      listings: listingsByStatus.pending,
      identityChecks,
      mechanicDocuments,
    },
  };
};

export const listUsers = async (query: z.infer<typeof adminUsersQuerySchema>) => {
  const { users, total } = await findUsers(query);
  return { users, meta: meta(total, query) };
};

export const getUser = async (userId: number) => {
  const user = await findUserForAdmin(userId);
  if (!user) {
    throw new NotFoundError("admin.user_not_found");
  }
  const { imageName, role, mechanic, ...profile } = user;
  const [listings, inspectionsRequested, devices, history, verification, imageUrl] = await Promise.all([
    countUserListingsByStatus(userId),
    countInspectionsRequestedBy(userId),
    findSignedInDevices(userId),
    findAuditEntriesAbout("user", userId, 20),
    role.name === "mechanic" ? getMyVerification(userId) : null,
    getProfileImageUrl(imageName),
  ]);
  return {
    ...profile,
    role: role.name,
    imageUrl,
    signedInDevices: devices.length,
    listings: { byStatus: countsOf(listingStatusEnum.enumValues, listings) },
    inspectionsRequested,
    mechanic: mechanic
      ? {
          ...mechanic,
          inspections: await countInspectionsByMechanic(mechanic.id),
          verification: verification && {
            kind: verification.kind,
            status: verification.status,
            bookable: verification.bookable,
            validUntil: verification.validUntil,
          },
        }
      : null,
    history,
  };
};

// The user an admin acts on: not themselves, and not another admin.
const requireTarget = async (actorUserId: number, userId: number) => {
  const target = await findUserRole(userId);
  if (!target) {
    throw new NotFoundError("admin.user_not_found");
  }
  if (userId === actorUserId) {
    throw new BadRequestError("admin.cannot_act_on_self");
  }
  if (target.role === "admin") {
    throw new NotAllowedError("admin.cannot_act_on_admin");
  }
  return target;
};

// Ends every session at once and tells the user's open pages.
const signOutEverywhere = async (userId: number) => {
  await endUserSessions(userId);
  await deleteChallenges(userId);
  await publishSessionRevoked(userId, "all");
  await publishDevicesChanged(userId);
};

// Tells the user their account was suspended, with the reason, or that it is
// active again, in their own language. A failed email doesn't undo the change.
const sendAccountStatusEmail = async (
  userId: number,
  key: "account_suspended" | "account_reactivated",
  reason: string | null,
) => {
  const user = await findUserForAdmin(userId);
  if (!user) {
    return;
  }
  try {
    const html = await readTemplateFile("account_status.ejs", {
      ...emailTemplateContext(user.locale),
      key,
      firstName: user.firstName,
      date: new Intl.DateTimeFormat(user.locale, { dateStyle: "long" }).format(new Date()),
      reason,
      link: key === "account_reactivated" ? `${process.env.CLIENT_URL}/login?lang=${user.locale}` : null,
    });
    await sendMail({ to: user.email, subject: emailSubject(user.locale, `${key}.subject`), html });
  } catch (error) {
    console.error("Error sending account status email:", error);
  }
};

// The user can no longer sign in, their sessions end now, and buyers stop
// seeing their listings and their workshop. They get an email with the reason.
export const suspendUser = async (actorUserId: number, userId: number, reason: string) => {
  await requireTarget(actorUserId, userId);
  if (!(await suspendUserById(actorUserId, userId, reason))) {
    throw new BadRequestError("admin.already_suspended");
  }
  await signOutEverywhere(userId);
  await sendAccountStatusEmail(userId, "account_suspended", reason);
  return getUser(userId);
};

export const reactivateUser = async (actorUserId: number, userId: number) => {
  await requireTarget(actorUserId, userId);
  if (!(await reactivateUserById(actorUserId, userId))) {
    throw new BadRequestError("admin.not_suspended");
  }
  await sendAccountStatusEmail(userId, "account_reactivated", null);
  return getUser(userId);
};

// Deletes the account with everything it owns. A mechanic who inspected cars
// can't be deleted: buyers keep those reports. Suspend them instead.
export const deleteUser = async (actorUserId: number, userId: number, reason: string) => {
  const target = await requireTarget(actorUserId, userId);
  const user = await findUserForAdmin(userId);
  if (!user) {
    throw new NotFoundError("admin.user_not_found");
  }
  if (user.mechanic && (await countInspectionsByMechanic(user.mechanic.id)) > 0) {
    throw new BadRequestError("admin.user_has_inspections");
  }
  const files = await findUserFiles(userId);
  await deleteUserById(actorUserId, userId, {
    reason,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: target.role,
  });
  await removeFiles(files);
  await publishSessionRevoked(userId, "all");
  return { deleted: true, userId };
};

export const listListings = async (query: z.infer<typeof adminListingsQuerySchema>) => {
  const { listings, total } = await findListingsForAdmin(query);
  return { listings, meta: meta(total, query) };
};

// Takes a listing down for good, whatever its status.
export const deleteListing = async (actorUserId: number, listingId: number, reason: string) => {
  const listing = await findListingOwner(listingId);
  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }
  const files = await findListingFiles(listingId);
  await deleteListingById(actorUserId, listingId, {
    reason,
    title: listing.title,
    sellerId: listing.userId,
  });
  await removeFiles(files);
  return { deleted: true, listingId };
};

export const listMechanics = async (query: z.infer<typeof adminMechanicsQuerySchema>) => {
  const { mechanics, total } = await findMechanicsForAdmin(query);
  return { mechanics, meta: meta(total, query) };
};

export const listInspections = async (query: z.infer<typeof adminInspectionsQuerySchema>) => {
  const { inspections, total } = await findInspectionsForAdmin(query);
  return { inspections, meta: meta(total, query) };
};

export const listAuditLog = async (query: z.infer<typeof adminAuditLogQuerySchema>) => {
  const [{ entries, total }, actions] = await Promise.all([findAuditLog(query), findAuditActions()]);
  return { entries, actions, meta: meta(total, query) };
};

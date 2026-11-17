import { z } from "zod";
import { inspectionStatusEnum } from "../../db/schema/inspection";
import { listingStatusEnum } from "../../db/schema/listing";
import { identityStatusEnum } from "../../db/schema/user";

const page = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

const search = z.string().trim().min(1).max(100).optional();
const id = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id });

export const adminUsersQuerySchema = z.object({
  ...page,
  search,
  role: z.enum(["buyer", "seller", "mechanic", "admin"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  identityStatus: z.enum(identityStatusEnum.enumValues).optional(),
});

export const adminListingsQuerySchema = z.object({
  ...page,
  search,
  status: z.enum(listingStatusEnum.enumValues).optional(),
  sellerId: id.optional(),
});

export const adminMechanicsQuerySchema = z.object({
  ...page,
  search,
  cityId: id.optional(),
  status: z.enum(["bookable", "not_bookable", "awaiting_review"]).optional(),
});

export const adminInspectionsQuerySchema = z.object({
  ...page,
  status: z.enum(inspectionStatusEnum.enumValues).optional(),
  mechanicId: id.optional(),
  buyerId: id.optional(),
});

export const adminAuditLogQuerySchema = z.object({
  ...page,
  action: z.string().trim().min(1).max(100).optional(),
  targetType: z.string().trim().min(1).max(50).optional(),
  targetId: id.optional(),
  actorId: id.optional(),
});

// Why the admin acts, kept in the audit log.
export const reasonSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

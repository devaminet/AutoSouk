import { Router } from "express";
import type { ZodTypeAny, z } from "zod";
import { RequestValidationError } from "../../errors/request_validation_error";
import { isAdmin } from "../../middlewares/is_admin";
import isAuthenticated from "../../middlewares/is_authenticated";
import {
  adminAuditLogQuerySchema,
  adminInspectionsQuerySchema,
  adminListingsQuerySchema,
  adminMechanicsQuerySchema,
  adminUsersQuerySchema,
  idParamSchema,
  reasonSchema,
} from "./request_schema";
import {
  deleteListing,
  deleteUser,
  getOverview,
  getUser,
  listAuditLog,
  listInspections,
  listListings,
  listMechanics,
  listUsers,
  reactivateUser,
  suspendUser,
} from "./services";

const adminRouter = Router();

// Every route here is for admins only.
adminRouter.use(isAuthenticated, isAdmin);

const parse = <S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(result.error.errors);
  }
  return result.data;
};

/**
 * @openapi
 * components:
 *   schemas:
 *     AdminPageMeta:
 *       type: object
 *       properties:
 *         total: { type: integer }
 *         page: { type: integer }
 *         limit: { type: integer }
 *         totalPages: { type: integer }
 *     AdminReason:
 *       type: object
 *       required: [reason]
 *       properties:
 *         reason: { type: string, minLength: 1, maxLength: 500, description: Kept in the audit log }
 *     AdminUserSummary:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         firstName: { type: string }
 *         lastName: { type: string }
 *         email: { type: string }
 *         phone: { type: string }
 *         role: { type: string, enum: [buyer, seller, mechanic, admin] }
 *         emailVerified: { type: boolean }
 *         phoneVerifiedAt: { type: string, format: date-time, nullable: true }
 *         identityStatus: { type: string, enum: [not_submitted, pending, approved, rejected] }
 *         suspendedAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date }
 *     AdminUser:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         firstName: { type: string }
 *         lastName: { type: string }
 *         email: { type: string }
 *         phone: { type: string }
 *         role: { type: string, enum: [buyer, seller, mechanic, admin] }
 *         imageUrl: { type: string }
 *         isVerified: { type: boolean, description: The email address is verified }
 *         phoneVerifiedAt: { type: string, format: date-time, nullable: true }
 *         twoFactorEnabled: { type: boolean }
 *         identityStatus: { type: string, enum: [not_submitted, pending, approved, rejected] }
 *         locale: { type: string, enum: [fr, en, ar] }
 *         suspendedAt: { type: string, format: date-time, nullable: true }
 *         suspensionReason: { type: string, nullable: true }
 *         createdAt: { type: string, format: date }
 *         city:
 *           type: object
 *           nullable: true
 *           properties:
 *             name: { type: string }
 *             slug: { type: string }
 *         signedInDevices: { type: integer }
 *         listings:
 *           type: object
 *           properties:
 *             byStatus:
 *               type: object
 *               additionalProperties: { type: integer }
 *         inspectionsRequested: { type: integer }
 *         mechanic:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: integer }
 *             name: { type: string }
 *             isActive: { type: boolean }
 *             inspectionPrice: { type: integer, nullable: true }
 *             city:
 *               type: object
 *               properties:
 *                 name: { type: string }
 *                 slug: { type: string }
 *             inspections: { type: integer }
 *             verification:
 *               type: object
 *               nullable: true
 *               properties:
 *                 kind: { type: string, enum: [solo, garage], nullable: true }
 *                 status: { type: string, enum: [not_submitted, pending, approved, rejected, expired] }
 *                 bookable: { type: boolean }
 *                 validUntil: { type: string, format: date, nullable: true }
 *         history:
 *           type: array
 *           description: The latest 20 audit entries about this user, newest first
 *           items:
 *             $ref: '#/components/schemas/AdminAuditEntry'
 *     AdminAuditEntry:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         action: { type: string, example: user.suspended }
 *         targetType: { type: string, example: user }
 *         targetId: { type: integer }
 *         details: { type: object, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         actor:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: integer }
 *             firstName: { type: string }
 *             lastName: { type: string }
 */

/**
 * @openapi
 * /api/admin/overview:
 *   get:
 *     tags: [Admin]
 *     summary: Counts across the whole site, and what waits for an admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     byRole:
 *                       type: object
 *                       properties:
 *                         buyer: { type: integer }
 *                         seller: { type: integer }
 *                         mechanic: { type: integer }
 *                         admin: { type: integer }
 *                     suspended: { type: integer }
 *                 listings:
 *                   type: object
 *                   properties:
 *                     byStatus:
 *                       type: object
 *                       description: Every listing status, with 0 when none
 *                       additionalProperties: { type: integer }
 *                 mechanics:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     bookable: { type: integer }
 *                 inspections:
 *                   type: object
 *                   properties:
 *                     byStatus:
 *                       type: object
 *                       description: Every inspection status, with 0 when none
 *                       additionalProperties: { type: integer }
 *                 queues:
 *                   type: object
 *                   properties:
 *                     verifications: { type: integer, description: People with a face video or documents waiting for review (GET /api/admin/verifications) }
 *                     listings: { type: integer, description: Listings waiting for review }
 *                     identityChecks: { type: integer, description: Face checks waiting for review }
 *                     mechanicDocuments: { type: integer, description: Mechanics with documents waiting for review }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
adminRouter.get("/overview", async (_req, res) => {
  res.status(200).json(await getOverview());
});

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Every account, newest first
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: search, description: Part of the name, email or phone, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: role, schema: { type: string, enum: [buyer, seller, mechanic, admin] } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, suspended] } }
 *       - { in: query, name: identityStatus, schema: { type: string, enum: [not_submitted, pending, approved, rejected] } }
 *     responses:
 *       200:
 *         description: A page of accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AdminUserSummary' }
 *                 meta: { $ref: '#/components/schemas/AdminPageMeta' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
adminRouter.get("/users", async (req, res) => {
  res.status(200).json(await listUsers(parse(adminUsersQuerySchema, req.query)));
});

/**
 * @openapi
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: One account, with its activity and history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: The account
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminUser' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: admin.user_not_found
 *   delete:
 *     tags: [Admin]
 *     summary: Delete an account and everything it owns
 *     description: |
 *       Deletes the account, its listings, cars, media, favourites, inspections
 *       it asked for and their reports, its face checks, mechanic documents and
 *       workshop. Inspections of its cars stay with their buyers, reports
 *       included; those not finished are cancelled. Its sessions end at once. A mechanic with inspections can't
 *       be deleted, as buyers keep those reports: suspend them instead. Admins
 *       can't delete themselves or another admin. The audit log keeps who did
 *       it, with the reason.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminReason' }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean }
 *                 userId: { type: integer }
 *       400:
 *         description: Validation error, admin.cannot_act_on_self or admin.user_has_inspections
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin, or admin.cannot_act_on_admin
 *       404:
 *         description: admin.user_not_found
 */
adminRouter.get("/users/:id", async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.status(200).json(await getUser(id));
});

adminRouter.delete("/users/:id", async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const { reason } = parse(reasonSchema, req.body);
  res.status(200).json(await deleteUser(req.currentUser!.id, id, reason));
});

/**
 * @openapi
 * /api/admin/users/{id}/suspend:
 *   post:
 *     tags: [Admin]
 *     summary: Suspend an account
 *     description: |
 *       The user can no longer sign in (auth.account_suspended), every session
 *       ends now, and buyers stop seeing their listings and their workshop.
 *       Their data stays. The user gets an email in their language with the
 *       reason, so write it for them. Admins can't suspend themselves or
 *       another admin. Written to the audit log with the reason.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminReason' }
 *     responses:
 *       200:
 *         description: Suspended; the account as it now stands
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminUser' }
 *       400:
 *         description: Validation error, admin.cannot_act_on_self or admin.already_suspended
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin, or admin.cannot_act_on_admin
 *       404:
 *         description: admin.user_not_found
 */
adminRouter.post("/users/:id/suspend", async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const { reason } = parse(reasonSchema, req.body);
  res.status(200).json(await suspendUser(req.currentUser!.id, id, reason));
});

/**
 * @openapi
 * /api/admin/users/{id}/reactivate:
 *   post:
 *     tags: [Admin]
 *     summary: Lift an account's suspension
 *     description: The user can sign in again, and gets an email saying so. Written to the audit log.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Reactivated; the account as it now stands
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminUser' }
 *       400:
 *         description: admin.cannot_act_on_self or admin.not_suspended
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin, or admin.cannot_act_on_admin
 *       404:
 *         description: admin.user_not_found
 */
adminRouter.post("/users/:id/reactivate", async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.status(200).json(await reactivateUser(req.currentUser!.id, id));
});

/**
 * @openapi
 * /api/admin/listings:
 *   get:
 *     tags: [Admin]
 *     summary: Every listing in every status, newest first
 *     description: For the review queue, longest waiting first, use GET /api/listings/pending.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: search, description: Part of the title, or the seller's name or email, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: status, schema: { type: string, enum: [draft, pending, approved, withdrawn, rejected, sold] } }
 *       - { in: query, name: sellerId, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: A page of listings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       title: { type: string }
 *                       status: { type: string, enum: [draft, pending, approved, withdrawn, rejected, sold] }
 *                       rejectionReason: { type: string, nullable: true }
 *                       approvedAt: { type: string, format: date, nullable: true }
 *                       createdAt: { type: string, format: date }
 *                       updatedAt: { type: string, format: date }
 *                       seller:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id: { type: integer }
 *                           firstName: { type: string }
 *                           lastName: { type: string }
 *                           email: { type: string }
 *                           suspendedAt: { type: string, format: date-time, nullable: true }
 *                       car:
 *                         type: object
 *                         nullable: true
 *                         description: Null for a draft without a car
 *                         properties:
 *                           id: { type: integer }
 *                           price: { type: integer }
 *                           year: { type: integer }
 *                           make: { type: string, nullable: true }
 *                           model: { type: string, nullable: true }
 *                           city: { type: string, nullable: true, description: City slug }
 *                 meta: { $ref: '#/components/schemas/AdminPageMeta' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
adminRouter.get("/listings", async (req, res) => {
  res.status(200).json(await listListings(parse(adminListingsQuerySchema, req.query)));
});

/**
 * @openapi
 * /api/admin/listings/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a listing, whatever its status
 *     description: Deletes the listing, its car and media. The car's inspections stay with their buyers, reports included; those not finished are cancelled. Written to the audit log with the reason.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminReason' }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean }
 *                 listingId: { type: integer }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: listing.not_found
 */
adminRouter.delete("/listings/:id", async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const { reason } = parse(reasonSchema, req.body);
  res.status(200).json(await deleteListing(req.currentUser!.id, id, reason));
});

/**
 * @openapi
 * /api/admin/mechanics:
 *   get:
 *     tags: [Admin]
 *     summary: Every workshop, newest first
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: search, description: Part of the workshop name, or the owner's name or email, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: cityId, schema: { type: integer } }
 *       - { in: query, name: status, schema: { type: string, enum: [bookable, not_bookable, awaiting_review] } }
 *     responses:
 *       200:
 *         description: A page of workshops
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mechanics:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       city: { type: string, description: City slug }
 *                       isActive: { type: boolean, description: The mechanic takes requests }
 *                       inspectionPrice: { type: integer, nullable: true }
 *                       bookable: { type: boolean, description: Documents approved and valid, and the account not suspended }
 *                       awaitingReview: { type: boolean, description: Documents wait for an admin }
 *                       averageRating: { type: number, nullable: true }
 *                       reviewsCount: { type: integer }
 *                       completedInspections: { type: integer }
 *                       createdAt: { type: string, format: date }
 *                       user:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           firstName: { type: string }
 *                           lastName: { type: string }
 *                           email: { type: string }
 *                           suspendedAt: { type: string, format: date-time, nullable: true }
 *                 meta: { $ref: '#/components/schemas/AdminPageMeta' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
adminRouter.get("/mechanics", async (req, res) => {
  res.status(200).json(await listMechanics(parse(adminMechanicsQuerySchema, req.query)));
});

/**
 * @openapi
 * /api/admin/inspections:
 *   get:
 *     tags: [Admin]
 *     summary: Every inspection, latest request first
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, accepted, rejected, in_progress, completed, cancelled] } }
 *       - { in: query, name: mechanicId, schema: { type: integer } }
 *       - { in: query, name: buyerId, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: A page of inspections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inspections:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       status: { type: string, enum: [pending, accepted, rejected, in_progress, completed, cancelled] }
 *                       verdict: { type: string, enum: [excellent, good, fair, poor], nullable: true }
 *                       overallScore: { type: integer, nullable: true }
 *                       priceAtRequest: { type: integer }
 *                       requestedAt: { type: string, format: date-time }
 *                       acceptedAt: { type: string, format: date-time, nullable: true }
 *                       completedAt: { type: string, format: date-time, nullable: true }
 *                       hasReport: { type: boolean }
 *                       buyer:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           firstName: { type: string }
 *                           lastName: { type: string }
 *                       mechanic:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           name: { type: string }
 *                       car:
 *                         type: object
 *                         description: A deleted car has no id; its name is the one it had when the buyer asked
 *                         properties:
 *                           id: { type: integer, nullable: true }
 *                           removed: { type: boolean }
 *                           listingId: { type: integer, nullable: true }
 *                           year: { type: integer, nullable: true }
 *                           make: { type: string, nullable: true }
 *                           model: { type: string, nullable: true }
 *                 meta: { $ref: '#/components/schemas/AdminPageMeta' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
adminRouter.get("/inspections", async (req, res) => {
  res.status(200).json(await listInspections(parse(adminInspectionsQuerySchema, req.query)));
});

/**
 * @openapi
 * /api/admin/audit-log:
 *   get:
 *     tags: [Admin]
 *     summary: Who saw or decided what, newest first
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: action, schema: { type: string, example: user.suspended } }
 *       - { in: query, name: targetType, schema: { type: string, example: user } }
 *       - { in: query, name: targetId, schema: { type: integer } }
 *       - { in: query, name: actorId, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: A page of entries, and every action in the log for the filter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AdminAuditEntry' }
 *                 actions:
 *                   type: array
 *                   items: { type: string }
 *                 meta: { $ref: '#/components/schemas/AdminPageMeta' }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
adminRouter.get("/audit-log", async (req, res) => {
  res.status(200).json(await listAuditLog(parse(adminAuditLogQuerySchema, req.query)));
});

export default adminRouter;

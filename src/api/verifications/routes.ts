import { Router } from "express";
import type { ZodTypeAny, z } from "zod";
import { RequestValidationError } from "../../errors/request_validation_error";
import { isAdmin } from "../../middlewares/is_admin";
import isAuthenticated from "../../middlewares/is_authenticated";
import { decideVerificationSchema, userIdParamSchema } from "./request_schema";
import { decideVerification, getVerification, listVerifications } from "./services";

const verificationsRouter = Router();

verificationsRouter.use(isAuthenticated, isAdmin);

const parse = <S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(result.error.errors);
  }
  return result.data;
};

/**
 * @openapi
 * /api/admin/verifications:
 *   get:
 *     tags: [Admin]
 *     summary: Everyone waiting for a check, longest waiting first
 *     description: |
 *       A user is here while their face video, their documents, or both wait
 *       for an admin. Mechanics can send documents once their face video is
 *       sent, so an admin often decides both together.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           firstName: { type: string }
 *                           lastName: { type: string }
 *                           email: { type: string }
 *                           role: { type: string, enum: [buyer, seller, mechanic, admin] }
 *                       mechanic:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           name: { type: string }
 *                           kind: { type: string, enum: [solo, garage], nullable: true }
 *                       waiting:
 *                         type: object
 *                         properties:
 *                           faceCheck: { type: boolean }
 *                           documents: { type: integer, description: Documents waiting }
 *                       since: { type: string, format: date-time, description: When the oldest item waiting was sent }
 *                       resent: { type: boolean, description: Something was rejected before }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
verificationsRouter.get("/", async (_req, res) => {
  res.status(200).json(await listVerifications());
});

/**
 * @openapi
 * /api/admin/verifications/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Everything one user sent, to decide on it in one place
 *     description: |
 *       The user's profile and checks, the face check waiting with its video
 *       and the challenges asked in order, earlier face checks, and for a
 *       mechanic every document (open each with
 *       GET /api/mechanic-documents/documents/{id}/link). The video link lasts
 *       10 minutes, and handing it out is written to the audit log.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: The user's review
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerification' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: admin.user_not_found
 */
verificationsRouter.get("/:userId", async (req, res) => {
  const { userId } = parse(userIdParamSchema, req.params);
  res.status(200).json(await getVerification(req.currentUser!.id, userId));
});

/**
 * @openapi
 * components:
 *   schemas:
 *     AdminVerification:
 *       type: object
 *       properties:
 *         user:
 *           type: object
 *           properties:
 *             id: { type: integer }
 *             firstName: { type: string }
 *             lastName: { type: string }
 *             email: { type: string }
 *             phone: { type: string }
 *             role: { type: string, enum: [buyer, seller, mechanic, admin] }
 *             emailVerified: { type: boolean }
 *             phoneVerifiedAt: { type: string, format: date-time, nullable: true }
 *             identityStatus: { type: string, enum: [not_submitted, pending, approved, rejected] }
 *             locale: { type: string, enum: [fr, en, ar] }
 *             city:
 *               type: object
 *               nullable: true
 *               properties:
 *                 name: { type: string }
 *                 slug: { type: string }
 *             suspendedAt: { type: string, format: date-time, nullable: true }
 *             createdAt: { type: string, format: date }
 *         faceCheck:
 *           type: object
 *           nullable: true
 *           description: The face check waiting for review
 *           properties:
 *             id: { type: integer }
 *             challenges:
 *               type: array
 *               description: Asked in this order while recording
 *               items: { type: string, enum: [turn_left, turn_right, look_up, look_down, smile, blink] }
 *             submittedAt: { type: string, format: date-time }
 *             contentType: { type: string, enum: [video/webm, video/mp4] }
 *             videoUrl: { type: string }
 *         faceCheckHistory:
 *           type: array
 *           description: Decided face checks, newest first; their videos are deleted
 *           items:
 *             type: object
 *             properties:
 *               id: { type: integer }
 *               status: { type: string, enum: [approved, rejected] }
 *               submittedAt: { type: string, format: date-time, nullable: true }
 *               reviewedAt: { type: string, format: date-time, nullable: true }
 *               rejectionReason: { type: string, nullable: true }
 *         attempts:
 *           type: object
 *           properties:
 *             rejected: { type: integer }
 *             max: { type: integer, description: Face checks a user may have rejected before they must contact support }
 *         mechanic:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: integer }
 *             name: { type: string }
 *             city:
 *               type: object
 *               properties:
 *                 name: { type: string }
 *                 slug: { type: string }
 *         documents:
 *           type: object
 *           nullable: true
 *           description: For mechanics; as in GET /api/mechanic-documents/reviews/{userId}
 *           properties:
 *             kind: { type: string, enum: [solo, garage], nullable: true }
 *             status: { type: string, enum: [not_submitted, pending, approved, rejected, expired] }
 *             bookable: { type: boolean }
 *             validUntil: { type: string, format: date, nullable: true }
 *             requiredTypes: { type: array, items: { type: string } }
 *             expiringTypes: { type: array, items: { type: string } }
 *             documents: { type: array, items: { type: object } }
 */

/**
 * @openapi
 * /api/admin/verifications/{userId}/decision:
 *   post:
 *     tags: [Admin]
 *     summary: Decide everything the user sent, in one go
 *     description: |
 *       Needs a decision on the face check waiting, if there is one, and one
 *       decision for each document waiting. They are saved together, with
 *       their audit entries, or not at all. The face video, and the files of
 *       rejected or replaced documents, are deleted. The user gets one email
 *       listing what was approved and what to send again, with the reasons.
 *       A mechanic is bookable once the face check and every required
 *       document are approved.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: userId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               faceCheck:
 *                 type: object
 *                 required: [decision]
 *                 properties:
 *                   decision: { type: string, enum: [approved, rejected] }
 *                   reason: { type: string, maxLength: 500, description: Required when rejecting; shown to the user }
 *               documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [documentId, decision]
 *                   properties:
 *                     documentId: { type: integer }
 *                     decision: { type: string, enum: [approved, rejected] }
 *                     reason: { type: string, maxLength: 500, description: Required when rejecting; shown to the mechanic }
 *                     validUntil: { type: string, format: date, description: Required to approve cin_front, cin_back and patente }
 *     responses:
 *       200:
 *         description: Saved; the user's review as it now stands
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdminVerification' }
 *       400:
 *         description: |
 *           Validation error, admin.nothing_to_review, admin.face_check_decision_required,
 *           admin.review_changed, identity.not_pending, identity.reason_required,
 *           mechanic_documents.not_pending, mechanic_documents.decisions_incomplete,
 *           mechanic_documents.reason_required, mechanic_documents.valid_until_required
 *           or mechanic_documents.already_expired
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: admin.user_not_found
 */
verificationsRouter.post("/:userId/decision", async (req, res) => {
  const { userId } = parse(userIdParamSchema, req.params);
  const body = parse(decideVerificationSchema, req.body);
  const result = await decideVerification(req.currentUser!.id, userId, {
    faceCheck: body.faceCheck
      ? { decision: body.faceCheck.decision, reason: body.faceCheck.reason ?? null }
      : undefined,
    documents: body.documents?.map((decision) => ({
      documentId: decision.documentId,
      decision: decision.decision,
      reason: decision.reason ?? null,
      validUntil: decision.validUntil ?? null,
    })),
  });
  res.status(200).json(result);
});

export default verificationsRouter;

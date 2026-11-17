import { Router } from "express";
import type { ZodSchema } from "zod";
import { RequestValidationError } from "../../errors/request_validation_error";
import { isAdmin } from "../../middlewares/is_admin";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isIdentityVerified } from "../../middlewares/is_identity_verified";
import { isMechanic } from "../../middlewares/is_mechanic";
import {
  chooseKindSchema,
  decideDocumentsSchema,
  idParamSchema,
  startUploadSchema,
  userIdParamSchema,
} from "./request_schema";
import {
  chooseKind,
  confirmDocumentUpload,
  decideDocuments,
  getDocumentLink,
  getMyVerification,
  getReview,
  listPendingReviews,
  removeDraftDocument,
  startDocumentUpload,
  submitDocuments,
} from "./services";

const mechanicDocumentsRouter = Router();

const parse = <T>(schema: ZodSchema<T>, value: unknown): T => {
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
 *     MechanicDocument:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         type: { type: string, enum: [cin_front, cin_back, rc, patente, ice, premises] }
 *         status: { type: string, enum: [uploaded, pending, approved, rejected] }
 *         contentType: { type: string, enum: [image/jpeg, image/png, application/pdf] }
 *         sizeBytes: { type: integer, nullable: true }
 *         validUntil: { type: string, format: date, nullable: true }
 *         expired: { type: boolean, description: An approved document past its end date }
 *         rejectionReason: { type: string, nullable: true }
 *         submittedAt: { type: string, format: date-time, nullable: true }
 *         reviewedAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *     MechanicVerification:
 *       type: object
 *       properties:
 *         kind: { type: string, enum: [solo, garage], nullable: true }
 *         status:
 *           type: string
 *           enum: [not_submitted, pending, approved, rejected, expired]
 *           description: pending while any document waits for an admin, even when the mechanic is bookable
 *         bookable: { type: boolean, description: Every required document approved and none expired }
 *         approvedAt: { type: string, format: date-time, nullable: true }
 *         validUntil: { type: string, format: date, nullable: true, description: The first end date among the approved documents }
 *         requiredTypes: { type: array, items: { type: string } }
 *         documents: { type: array, items: { $ref: '#/components/schemas/MechanicDocument' } }
 */

/**
 * @openapi
 * /api/mechanic-documents/me:
 *   get:
 *     tags: [Mechanic documents]
 *     summary: The signed-in mechanic's documents and whether buyers can book them
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The mechanic's documents
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MechanicVerification' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicDocumentsRouter.get("/me", isAuthenticated, isMechanic, async (req, res) => {
  res.status(200).json(await getMyVerification(req.currentUser!.id));
});

/**
 * @openapi
 * /api/mechanic-documents/me/kind:
 *   put:
 *     tags: [Mechanic documents]
 *     summary: Choose whether the mechanic works solo or runs a garage
 *     description: |
 *       Solo mechanics send both sides of their CIN. Garages also send the RC,
 *       the patente, the ICE certificate and the lease or title deed. The kind
 *       can't change once a document is waiting for review or approved.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind]
 *             properties:
 *               kind: { type: string, enum: [solo, garage] }
 *     responses:
 *       200:
 *         description: Saved
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MechanicVerification' }
 *       400:
 *         description: Validation error or mechanic_documents.kind_locked
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic, or identity.required
 */
mechanicDocumentsRouter.put(
  "/me/kind",
  isAuthenticated,
  isMechanic,
  isIdentityVerified,
  async (req, res) => {
    const { kind } = parse(chooseKindSchema, req.body);
    res.status(200).json(await chooseKind(req.currentUser!.id, kind));
  },
);

/**
 * @openapi
 * /api/mechanic-documents/me/documents:
 *   post:
 *     tags: [Mechanic documents]
 *     summary: Start uploading one document
 *     description: |
 *       Returns a presigned POST policy valid for 10 minutes. The file must
 *       have the given content type and weigh at most 10 MB. Confirm the
 *       upload afterwards. A new upload takes the place of the type's
 *       document not sent yet.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, contentType]
 *             properties:
 *               type: { type: string, enum: [cin_front, cin_back, rc, patente, ice, premises] }
 *               contentType: { type: string, enum: [image/jpeg, image/png, application/pdf] }
 *     responses:
 *       201:
 *         description: Upload started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     type: { type: string }
 *                     expiresAt: { type: string, format: date-time }
 *                 upload:
 *                   type: object
 *                   properties:
 *                     url: { type: string }
 *                     fields: { type: object, additionalProperties: { type: string } }
 *       400:
 *         description: Validation error, mechanic_documents.kind_required, mechanic_documents.type_not_needed or mechanic_documents.already_pending
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic, or identity.required
 */
mechanicDocumentsRouter.post(
  "/me/documents",
  isAuthenticated,
  isMechanic,
  isIdentityVerified,
  async (req, res) => {
    const { type, contentType } = parse(startUploadSchema, req.body);
    res.status(201).json(await startDocumentUpload(req.currentUser!.id, type, contentType));
  },
);

/**
 * @openapi
 * /api/mechanic-documents/me/documents/{id}/confirm:
 *   post:
 *     tags: [Mechanic documents]
 *     summary: Confirm a document's file was uploaded
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stored, not sent yet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document: { $ref: '#/components/schemas/MechanicDocument' }
 *       400:
 *         description: mechanic_documents.file_missing, mechanic_documents.file_invalid, mechanic_documents.expired or mechanic_documents.already_uploaded
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic, or identity.required
 *       404:
 *         description: mechanic_documents.not_found
 */
mechanicDocumentsRouter.post(
  "/me/documents/:id/confirm",
  isAuthenticated,
  isMechanic,
  isIdentityVerified,
  async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(200).json(await confirmDocumentUpload(req.currentUser!.id, id));
  },
);

/**
 * @openapi
 * /api/mechanic-documents/me/documents/{id}:
 *   delete:
 *     tags: [Mechanic documents]
 *     summary: Remove a document not sent yet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Removed, with its file
 *       400:
 *         description: mechanic_documents.not_removable (already sent)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic, or identity.required
 *       404:
 *         description: mechanic_documents.not_found
 */
mechanicDocumentsRouter.delete(
  "/me/documents/:id",
  isAuthenticated,
  isMechanic,
  isIdentityVerified,
  async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    await removeDraftDocument(req.currentUser!.id, id);
    res.status(204).send();
  },
);

/**
 * @openapi
 * /api/mechanic-documents/me/submit:
 *   post:
 *     tags: [Mechanic documents]
 *     summary: Send the uploaded documents for review
 *     description: |
 *       Every required document must be uploaded, waiting or approved and
 *       still valid, and at least one must be new.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sent
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MechanicVerification' }
 *       400:
 *         description: mechanic_documents.kind_required, mechanic_documents.incomplete (params.count is the number missing) or mechanic_documents.nothing_to_send
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic, or identity.required
 */
mechanicDocumentsRouter.post(
  "/me/submit",
  isAuthenticated,
  isMechanic,
  isIdentityVerified,
  async (req, res) => {
    res.status(200).json(await submitDocuments(req.currentUser!.id));
  },
);

/**
 * @openapi
 * /api/mechanic-documents/reviews:
 *   get:
 *     tags: [Mechanic documents]
 *     summary: Mechanics with documents waiting for review (admin)
 *     description: Longest waiting first. resent is true for a mechanic who had documents decided before.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The mechanics waiting
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reviews:
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
 *                       kind: { type: string, enum: [solo, garage], nullable: true }
 *                       mechanic:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           name: { type: string }
 *                           city: { type: string, nullable: true }
 *                       pendingCount: { type: integer }
 *                       submittedAt: { type: string, format: date-time }
 *                       resent: { type: boolean }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
mechanicDocumentsRouter.get("/reviews", isAuthenticated, isAdmin, async (_req, res) => {
  res.status(200).json(await listPendingReviews());
});

/**
 * @openapi
 * /api/mechanic-documents/reviews/{userId}:
 *   get:
 *     tags: [Mechanic documents]
 *     summary: One mechanic's checks and documents (admin)
 *     description: |
 *       Without links to the files: ask for each one with
 *       GET /api/mechanic-documents/documents/{id}/link, which is logged.
 *       expiringTypes lists the types that need an end date to be approved.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: The mechanic's review
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: mechanic_documents.mechanic_not_found
 */
mechanicDocumentsRouter.get("/reviews/:userId", isAuthenticated, isAdmin, async (req, res) => {
  const { userId } = parse(userIdParamSchema, req.params);
  res.status(200).json(await getReview(userId));
});

/**
 * @openapi
 * /api/mechanic-documents/reviews/{userId}/decisions:
 *   post:
 *     tags: [Mechanic documents]
 *     summary: Approve or reject each pending document of a mechanic (admin)
 *     description: |
 *       Needs one decision for every pending document. Rejected files are
 *       deleted, and an approved document replaces the older approved one of
 *       its type, whose file is deleted too. The mechanic is bookable once
 *       every required document is approved, until the first end date. The
 *       mechanic gets an email, and each decision is written to the audit log.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decisions]
 *             properties:
 *               decisions:
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
 *         description: Saved; the mechanic's review as it now stands
 *       400:
 *         description: Validation error, mechanic_documents.not_pending, mechanic_documents.decisions_incomplete, mechanic_documents.reason_required, mechanic_documents.valid_until_required or mechanic_documents.already_expired
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
mechanicDocumentsRouter.post(
  "/reviews/:userId/decisions",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { userId } = parse(userIdParamSchema, req.params);
    const { decisions } = parse(decideDocumentsSchema, req.body);
    const result = await decideDocuments(
      req.currentUser!.id,
      userId,
      decisions.map((decision) => ({
        documentId: decision.documentId,
        decision: decision.decision,
        reason: decision.reason ?? null,
        validUntil: decision.validUntil ?? null,
      })),
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/mechanic-documents/documents/{id}/link:
 *   get:
 *     tags: [Mechanic documents]
 *     summary: A 5-minute link to a document's file (admin)
 *     description: Every link handed out is written to the audit log.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: The link
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string }
 *                 contentType: { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: mechanic_documents.not_found (missing, not sent, or its file deleted)
 */
mechanicDocumentsRouter.get("/documents/:id/link", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.status(200).json(await getDocumentLink(req.currentUser!.id, id));
});

export default mechanicDocumentsRouter;

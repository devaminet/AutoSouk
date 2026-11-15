import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import { isAdmin } from "../../middlewares/is_admin";
import isAuthenticated from "../../middlewares/is_authenticated";
import {
  decideIdentityCheckSchema,
  identityCheckIdParamSchema,
  listIdentityChecksQuerySchema,
  startIdentityCheckSchema,
} from "./request_schema";
import {
  decideIdentityCheck,
  getMyIdentityStatus,
  listIdentityChecks,
  startIdentityCheck,
  submitIdentityCheck,
} from "./services";

const identityRouter = Router();

const parseId = (params: unknown) => {
  const result = identityCheckIdParamSchema.safeParse(params);
  if (!result.success) {
    throw new RequestValidationError(result.error.errors);
  }
  return result.data.id;
};

/**
 * @openapi
 * /api/identity/me:
 *   get:
 *     tags: [Identity]
 *     summary: Where the signed-in user is with the phone and face checks
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user's checks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phoneVerified: { type: boolean }
 *                 identityStatus:
 *                   type: string
 *                   enum: [not_submitted, pending, approved, rejected]
 *                 attemptsLeft: { type: integer }
 *                 rejectionReason: { type: string, nullable: true }
 *       401:
 *         description: Not authenticated
 */
identityRouter.get("/me", isAuthenticated, async (req, res) => {
  res.status(200).json(await getMyIdentityStatus(req.currentUser!.id));
});

/**
 * @openapi
 * /api/identity/verifications:
 *   post:
 *     tags: [Identity]
 *     summary: Start a face check
 *     description: |
 *       Returns the challenges to perform in order (slugs translated by the
 *       `identity_challenge` enum) and a presigned POST policy for the video.
 *       Upload the video before `expiresAt` (10 minutes), then submit it.
 *       The phone must be verified first. A user has 3 attempts.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contentType]
 *             properties:
 *               contentType: { type: string, enum: [video/webm, video/mp4] }
 *     responses:
 *       201:
 *         description: Session started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verification:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     challenges: { type: array, items: { type: string } }
 *                     expiresAt: { type: string, format: date-time }
 *                 upload:
 *                   type: object
 *                   properties:
 *                     url: { type: string }
 *                     fields: { type: object, additionalProperties: { type: string } }
 *                 attemptsLeft: { type: integer }
 *       400:
 *         description: Validation error, identity.phone_not_verified, identity.already_approved or identity.already_pending
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: identity.too_many_attempts
 */
identityRouter.post("/verifications", isAuthenticated, async (req, res) => {
  const validationResult = startIdentityCheckSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const result = await startIdentityCheck(
    req.currentUser!.id,
    validationResult.data.contentType,
  );
  res.status(201).json(result);
});

/**
 * @openapi
 * /api/identity/verifications/{id}/submit:
 *   post:
 *     tags: [Identity]
 *     summary: Send the uploaded face video for review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Waiting for review; identityStatus is pending
 *       400:
 *         description: identity.video_missing, identity.video_invalid, identity.expired or identity.already_pending
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: identity.not_found (missing or another user's)
 */
identityRouter.post(
  "/verifications/:id/submit",
  isAuthenticated,
  async (req, res) => {
    const result = await submitIdentityCheck(
      req.currentUser!.id,
      parseId(req.params),
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/identity/verifications:
 *   get:
 *     tags: [Identity]
 *     summary: List face checks for review (admin)
 *     description: |
 *       Pending checks come oldest first, each with a video link valid for 10
 *       minutes. Every link handed out is recorded in the audit log.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected], default: pending }
 *     responses:
 *       200:
 *         description: The checks, with the user and the challenges asked
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
identityRouter.get(
  "/verifications",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const validationResult = listIdentityChecksQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }
    const result = await listIdentityChecks(
      req.currentUser!.id,
      validationResult.data.status,
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/identity/verifications/{id}:
 *   patch:
 *     tags: [Identity]
 *     summary: Approve or reject a pending face check (admin)
 *     description: |
 *       Updates the user's identityStatus, deletes the video, writes the
 *       audit log and emails the user in their language.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [approved, rejected] }
 *               reason: { type: string, maxLength: 500, description: Required when rejecting; shown to the user }
 *     responses:
 *       200:
 *         description: Decision saved
 *       400:
 *         description: Validation error, identity.reason_required or identity.not_pending
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: identity.not_found
 */
identityRouter.patch(
  "/verifications/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const id = parseId(req.params);
    const validationResult = decideIdentityCheckSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }
    const { decision, reason } = validationResult.data;
    const result = await decideIdentityCheck(
      req.currentUser!.id,
      id,
      decision,
      reason,
    );
    res.status(200).json(result);
  },
);

export default identityRouter;

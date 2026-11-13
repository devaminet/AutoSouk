import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import { verifyPhoneCodeSchema } from "./request_schema";
import { sendPhoneCode, verifyPhoneCode } from "./services";

const phoneRouter = Router();

/**
 * @openapi
 * /api/auth/phone/code:
 *   post:
 *     tags: [Auth]
 *     summary: Text a 6-digit code to the signed-in user's phone
 *     description: |
 *       One code a minute and five an hour. The code expires after 10 minutes
 *       and allows 3 tries. A phone number can be verified by one account only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Code sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phone: { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *                 resendAt: { type: string, format: date-time }
 *       400:
 *         description: auth.phone_already_verified, auth.phone_in_use or auth.phone_unsupported (not a Moroccan number)
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: auth.phone_code_wait (params.seconds) or auth.phone_code_limit
 *       500:
 *         description: auth.sms_failed
 */
phoneRouter.post("/code", isAuthenticated, async (req, res) => {
  const result = await sendPhoneCode(req.currentUser!.id);
  res.status(200).json(result);
});

/**
 * @openapi
 * /api/auth/phone/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Check the code texted to the signed-in user's phone
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: "482619" }
 *     responses:
 *       200:
 *         description: Phone verified; returns the user with phoneVerified true
 *       400:
 *         description: |
 *           Validation error, auth.phone_code_missing, auth.phone_code_expired,
 *           auth.phone_code_invalid (params.count is the tries left),
 *           auth.phone_already_verified or auth.phone_in_use
 *       401:
 *         description: Not authenticated
 */
phoneRouter.post("/verify", isAuthenticated, async (req, res) => {
  const validationResult = verifyPhoneCodeSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await verifyPhoneCode(
    req.currentUser!.id,
    validationResult.data.code,
  );
  res.status(200).json(result);
});

export default phoneRouter;

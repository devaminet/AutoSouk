import { Request, Router } from "express";
import { z } from "zod";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import { byIp, rateLimit } from "../../middlewares/rate_limit";
import { deviceCookieName, readCookie } from "../../utils/cookies";
import { finishSignIn, signInContext } from "./http";
import {
  deviceIdParamSchema,
  twoFactorCodeSchema,
  twoFactorResendSchema,
  twoFactorSettingSchema,
} from "./request_schema";
import {
  completeTwoFactor,
  listDevices,
  resendTwoFactorCode,
  signOutDevice,
  updateTwoFactor,
} from "./services";

const sessionsRouter = Router();

const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(result.error.errors);
  }
  return result.data;
};

const currentDeviceToken = (req: Request) => readCookie(req, deviceCookieName);

/**
 * @openapi
 * /api/auth/login/two-factor:
 *   post:
 *     tags: [Auth]
 *     summary: Finish a sign-in on a new device with the code texted to the user
 *     description: |
 *       The code expires after 10 minutes and allows 3 tries. On success the
 *       device is remembered (autosouk_device cookie), so the next sign-in on
 *       it needs no code. Limited to 30 tries per IP every 15 minutes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [challengeToken, code]
 *             properties:
 *               challengeToken: { type: string }
 *               code: { type: string, example: "482619" }
 *     responses:
 *       200:
 *         description: Signed in; access token and user, as for /login
 *       400:
 *         description: Validation error, auth.phone_code_invalid (params.count is the tries left) or auth.two_factor_expired
 *       429:
 *         description: auth.too_many_attempts
 */
sessionsRouter.post(
  "/login/two-factor",
  rateLimit({ name: "two-factor-ip", windowMs: 15 * 60 * 1000, max: 30, key: byIp }),
  async (req, res) => {
    const { challengeToken, code } = parse(twoFactorCodeSchema, req.body);
    const result = await completeTwoFactor(challengeToken, code, signInContext(req));
    res.status(200).json(finishSignIn(req, res, { twoFactorRequired: false, ...result }));
  },
);

/**
 * @openapi
 * /api/auth/login/two-factor/resend:
 *   post:
 *     tags: [Auth]
 *     summary: Text a new code for a sign-in waiting for one
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [challengeToken]
 *             properties:
 *               challengeToken: { type: string }
 *     responses:
 *       200:
 *         description: New code sent, with fresh tries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phoneHint: { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error or auth.two_factor_expired
 *       429:
 *         description: auth.phone_code_wait (params.seconds) or auth.too_many_attempts
 */
sessionsRouter.post(
  "/login/two-factor/resend",
  rateLimit({ name: "two-factor-resend-ip", windowMs: 60 * 60 * 1000, max: 10, key: byIp }),
  async (req, res) => {
    const { challengeToken } = parse(twoFactorResendSchema, req.body);
    res.status(200).json(await resendTwoFactorCode(challengeToken));
  },
);

/**
 * @openapi
 * /api/auth/devices:
 *   get:
 *     tags: [Auth]
 *     summary: List the devices signed in to the account
 *     description: The device making the request has `current` true.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The devices, most recently used first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 devices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       label: { type: string, example: "Chrome on Windows" }
 *                       ipAddress: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       lastSeenAt: { type: string, format: date-time }
 *                       current: { type: boolean }
 *       401:
 *         description: Not authenticated
 */
sessionsRouter.get("/devices", isAuthenticated, async (req, res) => {
  res.status(200).json(await listDevices(req.currentUser!.id, currentDeviceToken(req)));
});

/**
 * @openapi
 * /api/auth/devices/{id}:
 *   delete:
 *     tags: [Auth]
 *     summary: Sign a device out
 *     description: Ends its sessions. Signing in on it again needs a code when two-step sign-in applies.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Signed out
 *       400:
 *         description: auth.device_is_current (log out instead)
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: auth.device_not_found
 */
sessionsRouter.delete("/devices/:id", isAuthenticated, async (req, res) => {
  const { id } = parse(deviceIdParamSchema, req.params);
  await signOutDevice(req.currentUser!.id, id, currentDeviceToken(req));
  res.status(204).end();
});

/**
 * @openapi
 * /api/auth/two-factor:
 *   patch:
 *     tags: [Auth]
 *     summary: Turn two-step sign-in on or off
 *     description: Turning it on needs a verified phone. Mechanics and admins can't turn it off.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: The user, with twoFactorEnabled updated
 *       400:
 *         description: Validation error or identity.phone_not_verified
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: auth.two_factor_required
 */
sessionsRouter.patch("/two-factor", isAuthenticated, async (req, res) => {
  const { enabled } = parse(twoFactorSettingSchema, req.body);
  res.status(200).json(await updateTwoFactor(req.currentUser!.id, enabled));
});

export default sessionsRouter;

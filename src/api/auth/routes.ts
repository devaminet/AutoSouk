import { Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resendTokenSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "./request_schema";
import { RequestValidationError } from "../../errors/request_validation_error";
import { BadRequestError } from "../../errors/bad_request_error";
import { NotAuthorizedError } from "../../errors/not_authorized_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import {
  loginUser,
  refreshTokens,
  resendVerificationEmail,
  resetPassword,
  sendForgotPasswordLink,
  setupUser,
  updatePassword,
  verifyForgotPasswordToken,
  verifyUser,
} from "./services";
import { InternalServerError } from "../../errors/internal_server_error";
import { tokenExpirationMinutes } from "../../utils/constants";

const authRouter = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password, phone, userType, cityId]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               phone: { type: string }
 *               userType: { type: string, enum: [buyer, seller, mechanic] }
 *               cityId: { type: integer }
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         description: Validation error
 */
authRouter.post("/register", async (req, res) => {
  const validationResult = registerSchema.safeParse(req.body);
  if (validationResult.error) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const token = await setupUser(validationResult.data);
  res.status(201).json({ message: "Account was created", token });
});

/**
 * @openapi
 * /api/auth/verify:
 *   get:
 *     tags: [Auth]
 *     summary: Verify a user's email via token
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verified with success
 *       400:
 *         description: Token missing, invalid, or expired
 */
authRouter.get("/verify", async (req, res, next) => {
  const { token } = req.query;
  if (!token) {
    throw new BadRequestError("Token is required");
  }
  const result = await verifyUser(token as string);
  if (!result.success) {
    throw new BadRequestError("Invalid or expired token");
  }
  res.status(200).json({ message: "Verified with success" });
});

/**
 * @openapi
 * /api/auth/re-verify:
 *   post:
 *     tags: [Auth]
 *     summary: Resend the email verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Verification email sent
 *       400:
 *         description: Validation error
 *       500:
 *         description: Could not send verification email
 */
authRouter.post("/re-verify", async (req, res, next) => {
  const validationResult = resendTokenSchema.safeParse(req.body);
  if (validationResult.error) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await resendVerificationEmail(validationResult.data.email);
  if (!result.success) {
    throw new InternalServerError("Could not send verification email");
  }
  res.status(200).json({ message: "A verification email has been sent" });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Access token and user issued (refresh token set as a session cookie)
 *       400:
 *         description: Validation error
 */
authRouter.post("/login", async (req, res) => {
  const validateResult = loginSchema.safeParse(req.body);
  if (validateResult.error) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const { accessToken, refreshToken, user } = await loginUser(
    validateResult.data,
  );
  req.session = {
    refreshToken,
  };
  res.status(200).json({ accessToken, user });
});

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token using the session's refresh token cookie
 *     responses:
 *       200:
 *         description: New access token and user issued
 *       401:
 *         description: Unauthorized (missing or invalid refresh token)
 */
authRouter.post("/refresh-token", async (req, res) => {
  const validateResult = refreshTokenSchema.safeParse(req.session);
  if (validateResult.error) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const token = validateResult.data.refreshToken;
  const result = await refreshTokens(token);
  if (!result.success) {
    req.session = undefined;
    throw new NotAuthorizedError("Unauthorized");
  }

  const { accessToken, refreshToken, user } = result;

  req.session = {
    refreshToken,
  };
  res.status(200).json({ accessToken, user });
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link by email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Validation error
 *       500:
 *         description: Could not send forgot password email
 */
authRouter.post("/forgot-password", async (req, res, next) => {
  const validateResult = forgotPasswordSchema.safeParse(req.body);
  if (!validateResult.success) {
    throw new RequestValidationError(validateResult.error.errors);
  }

  const result = await sendForgotPasswordLink(validateResult.data.email);
  if (!result.success) {
    throw new InternalServerError("Could not send forgot password email");
  }
  res.status(200).json({
    message: `Password reset email sent successfully. The reset link expires in ${tokenExpirationMinutes} minutes`,
  });
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   get:
 *     tags: [Auth]
 *     summary: Verify a forgot-password token and redirect to the reset page
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: email
 *         schema: { type: string, format: email }
 *     responses:
 *       301:
 *         description: Redirect to client reset-password page (or home if invalid)
 *       400:
 *         description: Token missing
 */
authRouter.get("/forgot-password", async (req, res) => {
  const { token, email } = req.query;
  if (!token) {
    throw new BadRequestError("Token is required");
  }
  const result = await verifyForgotPasswordToken(
    token as string,
    email as string,
  );
  if (result.success) {
    res.redirect(
      301,
      `${process.env.CLIENT_URL}/reset-password?token=${token}`,
    );
    return;
  }
  res.redirect(301, `${process.env.CLIENT_URL}/`);
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   put:
 *     tags: [Auth]
 *     summary: Set a new password using a forgot-password token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Validation error or update failed
 */
authRouter.put("/forgot-password", async (req, res) => {
  const validateResult = updatePasswordSchema.safeParse(req.body);
  if (!validateResult.success) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const result = await updatePassword(
    validateResult.data.token,
    validateResult.data.password,
  );
  if (!result.success) {
    throw new BadRequestError(
      "Could not update the password! Please try again",
    );
  }
  res.status(200).json({ message: "Your password was updated successfully" });
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   put:
 *     tags: [Auth]
 *     summary: Reset the current user's password (requires old password)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, oldPassword, password, confirmPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               oldPassword: { type: string }
 *               password: { type: string }
 *               confirmPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Validation error or update failed
 *       401:
 *         description: Not authenticated
 */
authRouter.put("/reset-password", isAuthenticated, async (req, res) => {
  const validateResult = resetPasswordSchema.safeParse(req.body);
  if (!validateResult.success) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const rowCount = await resetPassword(validateResult.data);
  if (rowCount === null || rowCount === 0) {
    throw new BadRequestError(
      "Could not update the password! Please try again",
    );
  }
  res.status(200).json({ message: "Your password was updated successfully" });
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out (clears the session cookie)
 *     responses:
 *       200:
 *         description: Success
 */
authRouter.post("/logout", (req, res) => {
  req.session = undefined;
  res.status(200).json({ message: "Success" });
});

export default authRouter;

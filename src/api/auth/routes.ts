import { Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resendTokenSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import { BadRequestError } from "../../errors/bad-request-error";
import { NotAuthorizedError } from "../../errors/not-authorized-error";
import isAuthenticated from "../../middlewares/is-authenticated";
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
import { InternalServerError } from "../../errors/internal-server-error";

const tokenExpirationMinutes = 5;
const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const validationResult = registerSchema.safeParse(req.body);
  if (validationResult.error) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const token = await setupUser(validationResult.data);
  res.status(201).json({ message: "Account was created", token });
});

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

authRouter.post("/logout", (req, res) => {
  req.session = undefined;
  res.status(200).json({ message: "Success" });
});

export default authRouter;

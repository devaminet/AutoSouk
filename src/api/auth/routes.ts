import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db";
import { usersTable } from "../../db/schema/user";
import {
  generateJWT,
  generateToken,
  hashPassword,
  readTemplateFile,
  sanitizeUser,
  sendMail,
  verifyJWT,
  verifyPassword,
} from "../../utils/functions";
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
import { emailVerificationTokensTable } from "../../db/schema/email_verification_tokens";
import { NotFoundError } from "../../errors/not-found-error";
import { refreshTokensTable } from "../../db/schema/refresh_tokens";
import { forgotPasswordTokensTable } from "../../db/schema/forget_password_tokens";
import { NotAuthorizedError } from "../../errors/not-authorized-error";
import isAuthenticated from "../../middlewares/is-authenticated";

const tokenExpirationMinutes = 5;
const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const validationResult = registerSchema.safeParse(req.body);
  if (validationResult.error) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const { email, password, city, firstName, lastName, phone, userType } =
    validationResult.data;
  const found = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (found.length > 0) {
    throw new BadRequestError("Email in use");
  }

  const { hashedPassword, salt } = await hashPassword(password);

  const createdUser = await db
    .insert(usersTable)
    .values({
      email,
      password: hashedPassword,
      salt,
      city,
      firstName,
      lastName,
      phone,
      role: userType,
    })
    .returning({ id: usersTable.id });

  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await db.insert(emailVerificationTokensTable).values({
    userId: createdUser[0].id,
    token,
    expiresAt,
  });

  const registerHTML = await readTemplateFile("register.ejs", {
    firstName,
    verificationUrl: `${process.env.BACKEND_URL}/api/auth/verify?token=${token}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: email,
    subject: "Verify Account",
    html: registerHTML,
  });

  res.status(201).json({ message: "Account was created", token });
});

authRouter.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    throw new BadRequestError("Token is required");
  }
  const response = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, token as string))
    .limit(1);
  if (response.length === 0) {
    throw new BadRequestError("Invalid token");
  }
  const { expiresAt } = response[0];
  const difference =
    (expiresAt.getTime() - new Date().getTime()) /
    1000 /
    60 /
    tokenExpirationMinutes;
  if (difference <= 0) {
    await db
      .delete(emailVerificationTokensTable)
      .where(eq(emailVerificationTokensTable.token, token as string));
    throw new BadRequestError("Link has been expired");
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, response[0].userId))
    .limit(1);
  if (user.length === 0) {
    throw new NotAuthorizedError();
  }
  if (user[0].isVerified) {
    throw new BadRequestError("User is already verified");
  }
  await db
    .update(usersTable)
    .set({ isVerified: true })
    .where(eq(usersTable.id, response[0].userId));
  await db
    .delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, token as string));

  res.status(200).json({ message: "Verified with success" });
});

authRouter.post("/re-verify", async (req, res) => {
  const validationResult = resendTokenSchema.safeParse(req.body);
  if (validationResult.error) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, validationResult.data.email))
    .limit(1);
  if (user.length === 0) {
    throw new NotFoundError("No account was found with this email");
  }
  if (user[0].isVerified) {
    throw new BadRequestError("User is already verified");
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await db.insert(emailVerificationTokensTable).values({
    userId: user[0].id,
    token,
    expiresAt,
  });

  const registerHTML = await readTemplateFile("register.ejs", {
    firstName: user[0].firstName,
    verificationUrl: `${process.env.BACKEND_URL}/api/auth/verify?token=${token}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: user[0].email,
    subject: "Verify Account",
    html: registerHTML,
  });
  res.status(200).json({ message: "A verification email has been sent" });
});

authRouter.post("/login", async (req, res) => {
  const validateResult = loginSchema.safeParse(req.body);
  if (validateResult.error) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const { email, password } = validateResult.data;
  const foundUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (foundUser.length === 0) {
    throw new NotAuthorizedError("Email or password is not correct");
  }

  if (!foundUser[0].isVerified) {
    throw new NotAuthorizedError("Your account is not verified");
  }

  const { password: storedPassword, salt, ...user } = foundUser[0];
  const isPasswordValid = await verifyPassword(password, storedPassword, salt);

  if (!isPasswordValid) {
    throw new NotAuthorizedError("Email or password is not correct");
  }

  const accessToken = await generateJWT(
    { id: user.id, email: user.email, issuedAt: new Date().getTime() },
    Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!)
  );
  const refreshToken = await generateJWT(
    { id: user.id, email: user.email, issuedAt: new Date().getTime() },
    Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!)
  );
  await db
    .insert(refreshTokensTable)
    .values({ userId: user.id, currentToken: refreshToken });
  req.session = {
    refreshToken,
  };
  res.status(200).json({ accessToken, user: sanitizeUser(foundUser[0]) });
});

authRouter.post("/refresh-token", async (req, res) => {
  console.log("session", req.session);
  const validateResult = refreshTokenSchema.safeParse(req.session);
  if (validateResult.error) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const token = validateResult.data.refreshToken;
  const decoded = await verifyJWT<{ id: number; email: string }>(token);

  // re-use detection
  const usedToken = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        ne(refreshTokensTable.currentToken, token),
        eq(refreshTokensTable.lastToken, token)
      )
    );
  if (usedToken.length > 0) {
    req.session = undefined;
    await db
      .delete(refreshTokensTable)
      .where(eq(refreshTokensTable.userId, decoded.id));
    throw new NotAuthorizedError("Unauthorized");
  }

  const userToken = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.currentToken, token),
        eq(refreshTokensTable.userId, decoded.id)
      )
    );
  if (userToken.length === 0) {
    req.session = undefined;
    await db
      .delete(refreshTokensTable)
      .where(eq(refreshTokensTable.userId, decoded.id));
    throw new NotAuthorizedError("Unauthorized");
  }
  if (userToken.length > 0) {
    const accessToken = await generateJWT(
      { id: decoded.id, email: decoded.email, issuedAt: new Date().getTime() },
      Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!)
    );
    const refreshToken = await generateJWT(
      { id: decoded.id, email: decoded.email, issuedAt: new Date().getTime() },
      Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!)
    );
    await db
      .update(refreshTokensTable)
      .set({
        currentToken: refreshToken,
        lastToken: token,
      })
      .where(
        and(
          eq(refreshTokensTable.currentToken, token),
          eq(refreshTokensTable.userId, decoded.id)
        )
      );
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.id));
    req.session = {
      refreshToken,
    };
    res.status(200).json({ accessToken, user: sanitizeUser(user[0]) });
    return;
  }

  req.session = undefined;
  throw new BadRequestError("An error occurred");
});

authRouter.post("/forgot-password", async (req, res) => {
  const validateResult = forgotPasswordSchema.safeParse(req.body);
  if (!validateResult.success) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const { email } = validateResult.data;
  const foundUser = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (foundUser.length === 0) {
    throw new NotFoundError("No account was registered with this email");
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);

  await db.insert(forgotPasswordTokensTable).values({
    userId: foundUser[0].id,
    token,
    expiresAt,
  });

  const forgotPasswordHTML = await readTemplateFile("forgot-password.ejs", {
    firstName: foundUser[0].firstName,
    forgotPasswordUrl: `${process.env.BACKEND_URL}/api/auth/forgot-password?token=${token}&email=${email}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: email,
    subject: "Password reset request for your account",
    html: forgotPasswordHTML,
  });

  res.status(200).json({
    message: `Password reset email sent successfully. The reset link expires in ${tokenExpirationMinutes} minutes`,
  });
});

authRouter.get("/forgot-password", async (req, res) => {
  const { token, email } = req.query;
  if (!token) {
    throw new BadRequestError("Token is required");
  }
  const result = await db
    .select()
    .from(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.token, token as string));
  if (result.length === 0) {
    throw new BadRequestError("Invalid token");
  }
  const difference =
    new Date(result[0].expiresAt).getTime() - new Date().getTime();

  if (difference <= 0) {
    await db
      .delete(forgotPasswordTokensTable)
      .where(eq(forgotPasswordTokensTable.token, token as string));
    throw new BadRequestError("Link has been expired");
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, result[0].userId))
    .limit(1);
  if (user.length === 0) {
    throw new NotFoundError();
  }
  if (user[0].email !== (email as string)) {
    throw new BadRequestError("Invalid token");
  }

  res.redirect(301, `${process.env.CLIENT_URL}/reset-password?token=${token}`);
});

authRouter.put("/forgot-password", async (req, res) => {
  const validateResult = updatePasswordSchema.safeParse(req.body);
  if (!validateResult.success) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const { password, token } = validateResult.data;
  const user = await db
    .select()
    .from(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.token, token));
  if (user.length === 0) {
    throw new BadRequestError("Invalid token");
  }
  const { hashedPassword, salt } = await hashPassword(password);
  const result = await db
    .update(usersTable)
    .set({ password: hashedPassword, salt })
    .where(eq(usersTable.id, user[0].userId));
  if (result.rowCount === 0) {
    throw new BadRequestError(
      "Could not update the password! Please try again"
    );
  }
  await db
    .delete(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.userId, user[0].id));
  res.status(200).json({ message: "Your password was updated successfully" });
});

authRouter.put("/reset-password", isAuthenticated, async (req, res) => {
  const validateResult = resetPasswordSchema.safeParse(req.body);
  if (!validateResult.success) {
    throw new RequestValidationError(validateResult.error.errors);
  }
  const { password, confirmPassword, oldPassword, email } = validateResult.data;
  if (password !== confirmPassword) {
    throw new BadRequestError(
      "Password and confirm password should be the same"
    );
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (user.length === 0) {
    throw new BadRequestError("User not found");
  }
  const isPasswordValid = await verifyPassword(
    oldPassword,
    user[0].password,
    user[0].salt
  );
  if (!isPasswordValid) {
    throw new BadRequestError("Invalid password");
  }
  const { hashedPassword, salt } = await hashPassword(password);
  const result = await db
    .update(usersTable)
    .set({ password: hashedPassword, salt })
    .where(eq(usersTable.email, email));
  if (result.rowCount === 0) {
    throw new BadRequestError(
      "Could not update the password! Please try again"
    );
  }
  res.status(200).json({ message: "Your password was updated successfully" });
});

authRouter.post("/logout", (req, res) => {
  req.session = undefined;
  res.status(200).json({ message: "Success" });
});

export default authRouter;

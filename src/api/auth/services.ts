import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { usersTable } from "../../db/schema/user";
import { registerSchema, resetPasswordSchema } from "./request-schema";
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
import { emailVerificationTokensTable } from "../../db/schema/email_verification_tokens";
import { BadRequestError } from "../../errors/bad-request-error";
import { NotAuthorizedError } from "../../errors/not-authorized-error";
import { refreshTokensTable } from "../../db/schema/refresh_tokens";
import { NotFoundError } from "../../errors/not-found-error";
import { forgotPasswordTokensTable } from "../../db/schema/forget_password_tokens";

const tokenExpirationMinutes = 5;

export const findUserByEmail = async (
  email: string,
): Promise<typeof usersTable.$inferSelect | null> => {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  return user[0];
};

export const createUser = async (user: z.infer<typeof registerSchema>) => {
  const { email, password, city, firstName, lastName, phone, userType } = user;
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

  return createdUser[0].id;
};

const insertVerificationToken = async (
  userId: number,
  token: string,
  expiresAt: Date,
) => {
  await db.insert(emailVerificationTokensTable).values({
    userId,
    token,
    expiresAt,
  });
};

export const setupUser = async (user: z.infer<typeof registerSchema>) => {
  const { firstName, email } = user;
  const found = await findUserByEmail(email);
  if (found) {
    throw new BadRequestError("Email in use");
  }

  const createdUser = await createUser(user);
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await insertVerificationToken(createdUser, token, expiresAt);
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

  return token;
};

export const resetPassword = async (
  data: z.infer<typeof resetPasswordSchema>,
) => {
  const { password, confirmPassword, oldPassword, email } = data;
  if (password !== confirmPassword) {
    throw new BadRequestError(
      "Password and confirm password should be the same",
    );
  }
  const user = await findUserByEmail(email);
  if (!user) {
    throw new BadRequestError("User not found");
  }
  const isPasswordValid = await verifyPassword(
    oldPassword,
    user.password,
    user.salt,
  );
  if (!isPasswordValid) {
    throw new BadRequestError("Invalid password");
  }
  const { hashedPassword, salt } = await hashPassword(password);
  const result = await db
    .update(usersTable)
    .set({ password: hashedPassword, salt })
    .where(eq(usersTable.email, email));

  return result.rowCount;
};

export const loginUser = async (data: { email: string; password: string }) => {
  const { email, password } = data;
  const foundUser = await findUserByEmail(email);

  if (!foundUser) {
    throw new NotAuthorizedError("Email or password is not correct");
  }

  if (!foundUser.isVerified) {
    throw new NotAuthorizedError("Your account is not verified");
  }

  const { password: storedPassword, salt, ...user } = foundUser;
  const isPasswordValid = await verifyPassword(password, storedPassword, salt);

  if (!isPasswordValid) {
    throw new NotAuthorizedError("Email or password is not correct");
  }

  const accessToken = await generateJWT(
    {
      id: user.id,
      email: user.email,
      issuedAt: new Date().getTime(),
      role: user.role,
    },
    Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!),
  );
  const refreshToken = await generateJWT(
    {
      id: user.id,
      email: user.email,
      issuedAt: new Date().getTime(),
      role: user.role,
    },
    Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!),
  );
  await db
    .insert(refreshTokensTable)
    .values({ userId: user.id, currentToken: refreshToken });

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(foundUser),
  };
};

export const verifyUser = async (token: string) => {
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

  return { success: true };
};

export const resendVerificationEmail = async (email: string) => {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new NotFoundError("No account was found with this email");
  }
  if (user.isVerified) {
    throw new BadRequestError("User is already verified");
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await db.insert(emailVerificationTokensTable).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const registerHTML = await readTemplateFile("register.ejs", {
    firstName: user.firstName,
    verificationUrl: `${process.env.BACKEND_URL}/api/auth/verify?token=${token}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: user.email,
    subject: "Verify Account",
    html: registerHTML,
  });

  return { success: true };
};

export const refreshTokens = async (token: string) => {
  const decoded = await verifyJWT<{ id: number; email: string; role: string }>(
    token,
  );

  // re-use detection
  const usedToken = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        ne(refreshTokensTable.currentToken, token),
        eq(refreshTokensTable.lastToken, token),
      ),
    );
  if (usedToken.length > 0) {
    await db
      .delete(refreshTokensTable)
      .where(eq(refreshTokensTable.userId, decoded.id));
    return { success: false };
  }

  const userToken = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.currentToken, token),
        eq(refreshTokensTable.userId, decoded.id),
      ),
    );
  if (userToken.length === 0) {
    await db
      .delete(refreshTokensTable)
      .where(eq(refreshTokensTable.userId, decoded.id));
    return { success: false };
  }
  if (userToken.length > 0) {
    const accessToken = await generateJWT(
      {
        id: decoded.id,
        email: decoded.email,
        issuedAt: new Date().getTime(),
        role: decoded.role,
      },
      Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!),
    );
    const refreshToken = await generateJWT(
      {
        id: decoded.id,
        email: decoded.email,
        issuedAt: new Date().getTime(),
        role: decoded.role,
      },
      Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!),
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
          eq(refreshTokensTable.userId, decoded.id),
        ),
      );
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.id));
    return {
      success: true,
      refreshToken,
      accessToken,
      user: sanitizeUser(user[0]),
    };
  }

  return { success: false };
};

export const sendForgotPasswordLink = async (email: string) => {
  const foundUser = await findUserByEmail(email);

  if (!foundUser) {
    throw new NotFoundError("No account was registered with this email");
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);

  await db.insert(forgotPasswordTokensTable).values({
    userId: foundUser.id,
    token,
    expiresAt,
  });

  const forgotPasswordHTML = await readTemplateFile("forgot-password.ejs", {
    firstName: foundUser.firstName,
    forgotPasswordUrl: `${process.env.BACKEND_URL}/api/auth/forgot-password?token=${token}&email=${email}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: email,
    subject: "Password reset request for your account",
    html: forgotPasswordHTML,
  });

  return { success: true };
};

export const verifyForgotPasswordToken = async (
  token: string,
  email: string,
) => {
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

  return { success: true };
};

export const updatePassword = async (token: string, password: string) => {
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
    return { success: false };
  }
  await db
    .delete(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.userId, user[0].id));

  return { success: true };
};

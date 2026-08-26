import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { usersTable } from "../../db/schema/user";
import { registerSchema } from "./request_schema";
import { hashPassword } from "../../utils/functions";
import { emailVerificationTokensTable } from "../../db/schema/email_verification_tokens";
import { refreshTokensTable } from "../../db/schema/refresh_tokens";
import { forgotPasswordTokensTable } from "../../db/schema/forget_password_tokens";

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

export const findUserById = async (id: number) => {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

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

export const insertVerificationToken = async (
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

export const getVerificationToken = async (token: string) => {
  const response = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, token))
    .limit(1);

  if (response.length === 0) {
    return null;
  }

  return response[0];
};

export const deleteVerificationToken = async (token: string) => {
  const response = await db
    .delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.token, token));
  return response.rows;
};

export const verifyUserById = async (id: number) => {
  const response = await db
    .update(usersTable)
    .set({ isVerified: true })
    .where(eq(usersTable.id, id));

  return response.rows;
};

export const insertUserRefrechToken = async (
  userId: number,
  refreshToken: string,
) => {
  return await db
    .insert(refreshTokensTable)
    .values({ userId: userId, currentToken: refreshToken })
    .returning();
};

export const insertPasswordResetToken = async (
  userId: number,
  token: string,
  expiresAt: Date,
) => {
  return await db
    .insert(forgotPasswordTokensTable)
    .values({
      userId,
      token,
      expiresAt,
    })
    .returning();
};

export const findPasswordResetToken = async (token: string) => {
  const result = await db
    .select()
    .from(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.token, token));

  if (result.length === 0) {
    return null;
  }

  return result[0];
};

export const deletePasswordResetToken = async (token: string) => {
  const result = await db
    .delete(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.token, token));

  return result.rows;
};

export const deletePasswordResetTokenByUserId = async (id: number) => {
  const result = await db
    .delete(forgotPasswordTokensTable)
    .where(eq(forgotPasswordTokensTable.userId, id));

  return result.rows;
};

export const deleteRefreshToken = async (userId: number) => {
  const result = await db
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.userId, userId));

  return result.rows;
};

export const findReusedRefreshToken = async (token: string) => {
  const result = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        ne(refreshTokensTable.currentToken, token),
        eq(refreshTokensTable.lastToken, token),
      ),
    );

  if (!result) {
    return null;
  }

  return result[0];
};

export const findUserRefreshToken = async (userId: number, token: string) => {
  const userToken = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.currentToken, token),
        eq(refreshTokensTable.userId, userId),
      ),
    );

  if (userToken.length === 0) {
    return null;
  }

  return userToken[0];
};

export const updateRefreshToken = async (
  userId: number,
  oldToken: string,
  newToken: string,
) => {
  return await db
    .update(refreshTokensTable)
    .set({
      currentToken: newToken,
      lastToken: oldToken,
    })
    .where(
      and(
        eq(refreshTokensTable.currentToken, oldToken),
        eq(refreshTokensTable.userId, userId),
      ),
    )
    .returning();
};

export const updateUserPassword = async (
  email: string,
  password: string,
  salt: string,
) => {
  const result = await db
    .update(usersTable)
    .set({ password, salt })
    .where(eq(usersTable.email, email));

  return result.rowCount;
};

export const updateUserPasswordById = async (
  userId: number,
  password: string,
  salt: string,
) => {
  const result = await db
    .update(usersTable)
    .set({ password, salt })
    .where(eq(usersTable.id, userId));

  return result.rowCount;
};

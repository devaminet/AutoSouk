import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { usersTable } from "../../db/schema/user";
import { registerSchema } from "./request_schema";
import { hashPassword } from "../../utils/functions";
import { emailVerificationTokensTable } from "../../db/schema/email_verification_tokens";

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

import { and, count, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { phoneVerificationCodesTable } from "../../db/schema/phone_verification_codes";
import { usersTable } from "../../db/schema/user";

// Another account that already verified this phone number, if any.
export const findOtherVerifiedPhoneOwner = async (
  userId: number,
  phone: string,
) => {
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.phone, phone),
        isNotNull(usersTable.phoneVerifiedAt),
        ne(usersTable.id, userId),
      ),
    )
    .limit(1);
  return owner ?? null;
};

export const findLatestPhoneCode = async (userId: number) => {
  const [code] = await db
    .select()
    .from(phoneVerificationCodesTable)
    .where(eq(phoneVerificationCodesTable.userId, userId))
    .orderBy(desc(phoneVerificationCodesTable.createdAt))
    .limit(1);
  return code ?? null;
};

export const countPhoneCodesSince = async (userId: number, since: Date) => {
  const [result] = await db
    .select({ total: count() })
    .from(phoneVerificationCodesTable)
    .where(
      and(
        eq(phoneVerificationCodesTable.userId, userId),
        gt(phoneVerificationCodesTable.createdAt, since),
      ),
    );
  return result?.total ?? 0;
};

export const insertPhoneCode = async (data: {
  userId: number;
  phone: string;
  codeHash: string;
  expiresAt: Date;
}) => {
  const [code] = await db
    .insert(phoneVerificationCodesTable)
    .values(data)
    .returning();
  return code;
};

export const deletePhoneCode = async (id: number) => {
  await db
    .delete(phoneVerificationCodesTable)
    .where(eq(phoneVerificationCodesTable.id, id));
};

// Counts a wrong try. Returns how many tries the code has had.
export const incrementPhoneCodeAttempts = async (id: number) => {
  const [code] = await db
    .update(phoneVerificationCodesTable)
    .set({ attempts: sql`${phoneVerificationCodesTable.attempts} + 1` })
    .where(eq(phoneVerificationCodesTable.id, id))
    .returning({ attempts: phoneVerificationCodesTable.attempts });
  return code?.attempts ?? 0;
};

// Marks the phone as verified and drops the user's codes. Throws the
// database's unique violation when another account verified it meanwhile.
export const markPhoneVerified = async (userId: number) =>
  db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ phoneVerifiedAt: new Date() })
      .where(eq(usersTable.id, userId));
    await tx
      .delete(phoneVerificationCodesTable)
      .where(eq(phoneVerificationCodesTable.userId, userId));
  });

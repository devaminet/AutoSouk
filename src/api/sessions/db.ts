import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { refreshTokensTable } from "../../db/schema/refresh_tokens";
import { twoFactorChallengesTable } from "../../db/schema/two_factor_challenge";
import { userDevicesTable } from "../../db/schema/user_device";
import { usersTable } from "../../db/schema/user";

export const findActiveDevice = async (userId: number, tokenHash: string) => {
  const [device] = await db
    .select()
    .from(userDevicesTable)
    .where(
      and(
        eq(userDevicesTable.userId, userId),
        eq(userDevicesTable.tokenHash, tokenHash),
        isNull(userDevicesTable.revokedAt),
      ),
    );
  return device ?? null;
};

export const countDevices = async (userId: number) => {
  const [result] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(userDevicesTable)
    .where(eq(userDevicesTable.userId, userId));
  return result?.total ?? 0;
};

export const insertDevice = async (data: {
  userId: number;
  tokenHash: string;
  label: string;
  ipAddress: string | null;
}) => {
  const [device] = await db.insert(userDevicesTable).values(data).returning();
  return device;
};

export const touchDevice = async (id: number, ipAddress: string | null) => {
  await db
    .update(userDevicesTable)
    .set({ lastSeenAt: new Date(), ...(ipAddress ? { ipAddress } : {}) })
    .where(eq(userDevicesTable.id, id));
};

export const isActiveDevice = async (id: number) => {
  const [device] = await db
    .select({ id: userDevicesTable.id })
    .from(userDevicesTable)
    .where(and(eq(userDevicesTable.id, id), isNull(userDevicesTable.revokedAt)));
  return Boolean(device);
};

export const findActiveDevices = async (userId: number) =>
  db
    .select()
    .from(userDevicesTable)
    .where(and(eq(userDevicesTable.userId, userId), isNull(userDevicesTable.revokedAt)))
    .orderBy(desc(userDevicesTable.lastSeenAt));

// Signs the device out: it must sign in again, with a code when two-step
// sign-in applies. Its refresh tokens stay, so the refresh can tell they
// belong to a signed-out device and refuse them without ending the user's
// other sessions. Returns false when it wasn't the user's active device.
export const revokeDevice = async (userId: number, id: number) => {
  const [device] = await db
    .update(userDevicesTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userDevicesTable.id, id),
        eq(userDevicesTable.userId, userId),
        isNull(userDevicesTable.revokedAt),
      ),
    )
    .returning({ id: userDevicesTable.id });
  return Boolean(device);
};

export const insertSessionToken = async (
  userId: number,
  deviceId: number,
  refreshToken: string,
) => {
  await db
    .insert(refreshTokensTable)
    .values({ userId, deviceId, currentToken: refreshToken });
};

export const deleteSessionToken = async (refreshToken: string) => {
  await db
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.currentToken, refreshToken));
};

export const insertChallenge = async (data: {
  userId: number;
  tokenHash: string;
  codeHash: string;
  expiresAt: Date;
}) => {
  const [challenge] = await db
    .insert(twoFactorChallengesTable)
    .values(data)
    .returning();
  return challenge;
};

export const findChallenge = async (tokenHash: string) => {
  const [challenge] = await db
    .select()
    .from(twoFactorChallengesTable)
    .where(eq(twoFactorChallengesTable.tokenHash, tokenHash));
  return challenge ?? null;
};

export const incrementChallengeAttempts = async (id: number) => {
  const [challenge] = await db
    .update(twoFactorChallengesTable)
    .set({ attempts: sql`${twoFactorChallengesTable.attempts} + 1` })
    .where(eq(twoFactorChallengesTable.id, id))
    .returning({ attempts: twoFactorChallengesTable.attempts });
  return challenge?.attempts ?? 0;
};

// A new code for the same sign-in: fresh tries and a fresh expiry.
export const renewChallengeCode = async (
  id: number,
  codeHash: string,
  expiresAt: Date,
) => {
  await db
    .update(twoFactorChallengesTable)
    .set({ codeHash, expiresAt, attempts: 0, sentAt: new Date() })
    .where(eq(twoFactorChallengesTable.id, id));
};

// A challenge is used once; older ones of the user go too.
export const deleteChallenges = async (userId: number) => {
  await db
    .delete(twoFactorChallengesTable)
    .where(eq(twoFactorChallengesTable.userId, userId));
};

export const deleteChallenge = async (id: number) => {
  await db
    .delete(twoFactorChallengesTable)
    .where(eq(twoFactorChallengesTable.id, id));
};

export const setTwoFactorEnabled = async (userId: number, enabled: boolean) => {
  await db
    .update(usersTable)
    .set({ twoFactorEnabled: enabled })
    .where(eq(usersTable.id, userId));
};

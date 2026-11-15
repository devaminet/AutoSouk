import { and, desc, eq, exists, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { refreshTokensTable } from "../../db/schema/refresh_tokens";
import { twoFactorChallengesTable } from "../../db/schema/two_factor_challenge";
import { userDevicesTable } from "../../db/schema/user_device";
import { usersTable } from "../../db/schema/user";

// The latest date Postgres and JavaScript both write the same way.
const latestDate = Date.UTC(9999, 11, 31);

// When a refresh token issued now stops working. A very long lifetime would
// give a date the database can't store, so it stops at the year 9999.
export const sessionExpiry = () =>
  new Date(
    Math.min(Date.now() + Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS) * 1000, latestDate),
  );

// A session that didn't log out and hasn't expired.
const isLive = () =>
  and(
    isNull(refreshTokensTable.endedAt),
    or(isNull(refreshTokensTable.expiresAt), gt(refreshTokensTable.expiresAt, new Date())),
  );

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

// The devices signed in now. A device that logged out stays remembered, so
// its next sign-in needs no code, but it has no session left.
export const findSignedInDevices = async (userId: number) =>
  db
    .select()
    .from(userDevicesTable)
    .where(
      and(
        eq(userDevicesTable.userId, userId),
        isNull(userDevicesTable.revokedAt),
        exists(
          db
            .select({ id: refreshTokensTable.id })
            .from(refreshTokensTable)
            .where(and(eq(refreshTokensTable.deviceId, userDevicesTable.id), isLive())),
        ),
      ),
    )
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

// Starts the device's session. A device has one session at a time, so this
// replaces any it had left, such as one whose cookie the browser dropped. It
// also drops the user's expired sessions.
export const insertSessionToken = async (
  userId: number,
  deviceId: number,
  refreshToken: string,
) => {
  await db.transaction(async (tx) => {
    await tx
      .delete(refreshTokensTable)
      .where(
        or(
          eq(refreshTokensTable.deviceId, deviceId),
          and(
            eq(refreshTokensTable.userId, userId),
            lte(refreshTokensTable.expiresAt, new Date()),
          ),
        ),
      );
    await tx
      .insert(refreshTokensTable)
      .values({ userId, deviceId, currentToken: refreshToken, expiresAt: sessionExpiry() });
  });
};

// Logs the session out. The token may be one refresh behind, when another tab
// rotated it at the same moment. The row stays, marked ended, so a request
// still carrying the token is refused without looking like theft. Returns
// whose session it was, or null when the token is unknown or already ended.
export const endSessionToken = async (refreshToken: string) => {
  const [session] = await db
    .update(refreshTokensTable)
    .set({ endedAt: new Date() })
    .where(
      and(
        isNull(refreshTokensTable.endedAt),
        or(
          eq(refreshTokensTable.currentToken, refreshToken),
          eq(refreshTokensTable.lastToken, refreshToken),
        ),
      ),
    )
    .returning({
      id: refreshTokensTable.id,
      userId: refreshTokensTable.userId,
      deviceId: refreshTokensTable.deviceId,
    });
  return session ?? null;
};

// Whether the session row still lives. Refreshing rotates the token but keeps
// the row, so the row is what a long-lived stream checks.
export const isLiveSession = async (id: number) => {
  const [session] = await db
    .select({ id: refreshTokensTable.id })
    .from(refreshTokensTable)
    .where(and(eq(refreshTokensTable.id, id), isLive()));
  return Boolean(session);
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

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotAllowedError } from "../../errors/not_allowed";
import { NotFoundError } from "../../errors/not_found_error";
import { TooManyRequestsError } from "../../errors/too_many_requests_error";
import { translate } from "../../i18n";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";
import { findUserById } from "../auth/db";
import { SmsRecipientError } from "../../sms/errors";
import {
  generateJWT,
  readTemplateFile,
  sanitizeUser,
  sendMail,
} from "../../utils/functions";
import { sendSms } from "../../utils/sms";
import { deviceLabel } from "../../utils/user_agent";
import {
  maxPhoneCodeAttempts,
  phoneCodeExpirationMinutes,
  phoneCodeLength,
  phoneCodeResendSeconds,
} from "../../utils/constants";
import {
  countDevices,
  deleteChallenge,
  deleteChallenges,
  findActiveDevice,
  findActiveDevices,
  findChallenge,
  incrementChallengeAttempts,
  insertChallenge,
  insertDevice,
  insertSessionToken,
  renewChallengeCode,
  revokeDevice,
  setTwoFactorEnabled,
  touchDevice,
} from "./db";

type UserWithRole = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

// Where a sign-in comes from.
export type SignInContext = {
  // The token in the device cookie, if the browser sent one.
  deviceToken: string | null;
  userAgent: string | undefined;
  ip: string | null;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const newCode = () =>
  String(randomInt(0, 10 ** phoneCodeLength)).padStart(phoneCodeLength, "0");

const codeExpiry = () => new Date(Date.now() + phoneCodeExpirationMinutes * 60 * 1000);

// Mechanics and admins always sign in on a new device with a code.
export const isTwoFactorRequired = (role: string) =>
  role === "mechanic" || role === "admin";

// A code is only possible once the phone is verified.
const needsCode = (user: UserWithRole) =>
  user.phoneVerifiedAt !== null &&
  (user.twoFactorEnabled || isTwoFactorRequired(user.role.name));

// "+212612345678" shows as "•• 78": enough to know which phone, without
// giving the number to someone who only has the password.
const phoneHint = (phone: string) => `•• ${phone.replace(/\D/g, "").slice(-2)}`;

const issueTokens = async (user: UserWithRole, deviceId: number) => {
  const claims = {
    id: user.id,
    email: user.email,
    issuedAt: new Date().getTime(),
    role: user.role.name,
  };
  const accessToken = await generateJWT(
    claims,
    Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!),
  );
  const refreshToken = await generateJWT(
    claims,
    Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!),
  );
  if (!accessToken || !refreshToken) {
    throw new InternalServerError("auth.login_failed");
  }
  await insertSessionToken(user.id, deviceId, refreshToken);
  return { accessToken, refreshToken, user: await sanitizeUser(user) };
};

const alertNewDevice = async (
  user: UserWithRole,
  label: string,
  ip: string | null,
) => {
  try {
    const time = new Intl.DateTimeFormat(user.locale, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Casablanca",
    }).format(new Date());
    const html = await readTemplateFile("new_sign_in.ejs", {
      ...emailTemplateContext(user.locale),
      firstName: user.firstName,
      device: label,
      ip: ip ?? "?",
      time,
      link: `${process.env.CLIENT_URL}/account#identity`,
    });
    await sendMail({
      to: user.email,
      subject: emailSubject(user.locale, "new_sign_in.subject"),
      html,
    });
  } catch (error) {
    console.error("Error sending new sign-in email:", error);
  }
};

// Remembers this browser and opens a session on it. Every device after the
// first one gets an email, so the owner notices a sign-in that wasn't theirs.
const signInOnNewDevice = async (user: UserWithRole, context: SignInContext) => {
  const known = await countDevices(user.id);
  const deviceToken = randomBytes(32).toString("hex");
  const label = deviceLabel(context.userAgent);
  const device = await insertDevice({
    userId: user.id,
    tokenHash: hash(deviceToken),
    label,
    ipAddress: context.ip,
  });
  if (known > 0) {
    await alertNewDevice(user, label, context.ip);
  }
  return { ...(await issueTokens(user, device.id)), deviceToken };
};

const textCode = async (user: UserWithRole, code: string) => {
  try {
    await sendSms(
      user.phone,
      translate(user.locale, "messages:sms.login_code", {
        code,
        minutes: phoneCodeExpirationMinutes,
      }),
    );
  } catch (error) {
    if (error instanceof SmsRecipientError) {
      throw new BadRequestError("auth.phone_unsupported");
    }
    console.error("Error sending sign-in code:", error);
    throw new InternalServerError("auth.sms_failed");
  }
};

export type SignInResult =
  | {
      twoFactorRequired: false;
      accessToken: string;
      refreshToken: string;
      user: Awaited<ReturnType<typeof sanitizeUser>>;
      // Set when the browser is new and must keep this in its device cookie.
      deviceToken: string | null;
    }
  | {
      twoFactorRequired: true;
      challengeToken: string;
      phoneHint: string;
      expiresAt: Date;
    };

// The next step once the password is right: a session on a known device, a
// code on a new device when two-step sign-in applies, or a session on a
// new device otherwise.
export const startSignIn = async (
  user: UserWithRole,
  context: SignInContext,
): Promise<SignInResult> => {
  const known = context.deviceToken
    ? await findActiveDevice(user.id, hash(context.deviceToken))
    : null;
  if (known) {
    await touchDevice(known.id, context.ip);
    return { twoFactorRequired: false, ...(await issueTokens(user, known.id)), deviceToken: null };
  }

  if (!needsCode(user)) {
    return { twoFactorRequired: false, ...(await signInOnNewDevice(user, context)) };
  }

  await deleteChallenges(user.id);
  const challengeToken = randomBytes(32).toString("hex");
  const code = newCode();
  const challenge = await insertChallenge({
    userId: user.id,
    tokenHash: hash(challengeToken),
    codeHash: hash(`${user.id}:${code}`),
    expiresAt: codeExpiry(),
  });
  try {
    await textCode(user, code);
  } catch (error) {
    await deleteChallenge(challenge.id);
    throw error;
  }
  return {
    twoFactorRequired: true,
    challengeToken,
    phoneHint: phoneHint(user.phone),
    expiresAt: challenge.expiresAt,
  };
};

const requireChallenge = async (challengeToken: string) => {
  const challenge = await findChallenge(hash(challengeToken));
  if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= maxPhoneCodeAttempts) {
    throw new BadRequestError("auth.two_factor_expired");
  }
  const user = await findUserById(challenge.userId);
  if (!user) {
    throw new BadRequestError("auth.two_factor_expired");
  }
  return { challenge, user };
};

// Finishes a sign-in on a new device with the code texted to the user.
export const completeTwoFactor = async (
  challengeToken: string,
  code: string,
  context: SignInContext,
) => {
  const { challenge, user } = await requireChallenge(challengeToken);
  if (!sameHash(challenge.codeHash, hash(`${user.id}:${code}`))) {
    const attempts = await incrementChallengeAttempts(challenge.id);
    const left = Math.max(maxPhoneCodeAttempts - attempts, 0);
    if (left === 0) {
      throw new BadRequestError("auth.two_factor_expired");
    }
    throw new BadRequestError("auth.phone_code_invalid", { count: left });
  }
  await deleteChallenges(user.id);
  return signInOnNewDevice(user, context);
};

// Texts a new code for the same sign-in, at most once a minute.
export const resendTwoFactorCode = async (challengeToken: string) => {
  const challenge = await findChallenge(hash(challengeToken));
  if (!challenge || challenge.createdAt.getTime() + 30 * 60 * 1000 < Date.now()) {
    throw new BadRequestError("auth.two_factor_expired");
  }
  const wait = challenge.sentAt.getTime() + phoneCodeResendSeconds * 1000 - Date.now();
  if (wait > 0) {
    throw new TooManyRequestsError("auth.phone_code_wait", { seconds: Math.ceil(wait / 1000) });
  }
  const user = await findUserById(challenge.userId);
  if (!user) {
    throw new BadRequestError("auth.two_factor_expired");
  }
  const code = newCode();
  const expiresAt = codeExpiry();
  await renewChallengeCode(challenge.id, hash(`${user.id}:${code}`), expiresAt);
  await textCode(user, code);
  return { phoneHint: phoneHint(user.phone), expiresAt };
};

// The browsers and phones signed in to the account, the current one marked.
export const listDevices = async (userId: number, deviceToken: string | null) => {
  const devices = await findActiveDevices(userId);
  const current = deviceToken ? hash(deviceToken) : null;
  return {
    devices: devices.map((device) => ({
      id: device.id,
      label: device.label,
      ipAddress: device.ipAddress,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      current: device.tokenHash === current,
    })),
  };
};

// Signs another device out. The current one logs out instead.
export const signOutDevice = async (
  userId: number,
  deviceId: number,
  deviceToken: string | null,
) => {
  const current = deviceToken ? await findActiveDevice(userId, hash(deviceToken)) : null;
  if (current?.id === deviceId) {
    throw new BadRequestError("auth.device_is_current");
  }
  if (!(await revokeDevice(userId, deviceId))) {
    throw new NotFoundError("auth.device_not_found");
  }
};

// Turns two-step sign-in on or off. It needs a verified phone, and
// mechanics and admins can't turn it off.
export const updateTwoFactor = async (userId: number, enabled: boolean) => {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError("auth.user_not_found");
  }
  if (enabled && !user.phoneVerifiedAt) {
    throw new BadRequestError("identity.phone_not_verified");
  }
  if (!enabled && isTwoFactorRequired(user.role.name)) {
    throw new NotAllowedError("auth.two_factor_required");
  }
  await setTwoFactorEnabled(user.id, enabled);
  const updated = await findUserById(user.id);
  return { user: await sanitizeUser(updated!) };
};

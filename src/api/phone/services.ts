import { createHash, randomInt, timingSafeEqual } from "crypto";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import { TooManyRequestsError } from "../../errors/too_many_requests_error";
import { translate } from "../../i18n";
import { findUserById } from "../auth/db";
import { sanitizeUser } from "../../utils/functions";
import { sendSms } from "../../utils/sms";
import { SmsRecipientError } from "../../sms/errors";
import {
  maxPhoneCodeAttempts,
  maxPhoneCodesPerHour,
  phoneCodeExpirationMinutes,
  phoneCodeLength,
  phoneCodeResendSeconds,
} from "../../utils/constants";
import {
  countPhoneCodesSince,
  deletePhoneCode,
  findLatestPhoneCode,
  findOtherVerifiedPhoneOwner,
  incrementPhoneCodeAttempts,
  insertPhoneCode,
  markPhoneVerified,
} from "./db";

// The code is bound to the user, so a leaked hash can't be replayed elsewhere.
const hashCode = (userId: number, code: string) =>
  createHash("sha256").update(`${userId}:${code}`).digest("hex");

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const requireUnverifiedUser = async (userId: number) => {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError("auth.user_not_found");
  }
  if (user.phoneVerifiedAt) {
    throw new BadRequestError("auth.phone_already_verified");
  }
  return user;
};

const resendAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + phoneCodeResendSeconds * 1000);

// Texts a new code to the user's phone, at most once a minute and five times
// an hour.
export const sendPhoneCode = async (userId: number) => {
  const user = await requireUnverifiedUser(userId);
  if (await findOtherVerifiedPhoneOwner(user.id, user.phone)) {
    throw new BadRequestError("auth.phone_in_use");
  }

  const now = new Date();
  const latest = await findLatestPhoneCode(user.id);
  if (latest && resendAt(latest.createdAt) > now) {
    const seconds = Math.ceil(
      (resendAt(latest.createdAt).getTime() - now.getTime()) / 1000,
    );
    throw new TooManyRequestsError("auth.phone_code_wait", { seconds });
  }
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  if ((await countPhoneCodesSince(user.id, hourAgo)) >= maxPhoneCodesPerHour) {
    throw new TooManyRequestsError("auth.phone_code_limit");
  }

  const code = String(randomInt(0, 10 ** phoneCodeLength)).padStart(
    phoneCodeLength,
    "0",
  );
  const saved = await insertPhoneCode({
    userId: user.id,
    phone: user.phone,
    codeHash: hashCode(user.id, code),
    expiresAt: new Date(now.getTime() + phoneCodeExpirationMinutes * 60 * 1000),
  });

  try {
    await sendSms(
      user.phone,
      translate(user.locale, "messages:sms.phone_code", {
        code,
        minutes: phoneCodeExpirationMinutes,
      }),
    );
  } catch (error) {
    await deletePhoneCode(saved.id);
    if (error instanceof SmsRecipientError) {
      throw new BadRequestError("auth.phone_unsupported");
    }
    console.error("Error sending phone code:", error);
    throw new InternalServerError("auth.sms_failed");
  }

  return {
    phone: user.phone,
    expiresAt: saved.expiresAt,
    resendAt: resendAt(saved.createdAt),
  };
};

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === "23505" ||
  (error as { cause?: { code?: string } }).cause?.code === "23505";

// Checks the code the user typed against the last one texted to them.
export const verifyPhoneCode = async (userId: number, code: string) => {
  const user = await requireUnverifiedUser(userId);
  const latest = await findLatestPhoneCode(user.id);
  if (!latest) {
    throw new BadRequestError("auth.phone_code_missing");
  }
  if (
    latest.phone !== user.phone ||
    latest.expiresAt <= new Date() ||
    latest.attempts >= maxPhoneCodeAttempts
  ) {
    throw new BadRequestError("auth.phone_code_expired");
  }

  if (!sameHash(latest.codeHash, hashCode(user.id, code))) {
    const attempts = await incrementPhoneCodeAttempts(latest.id);
    const left = Math.max(maxPhoneCodeAttempts - attempts, 0);
    if (left === 0) {
      throw new BadRequestError("auth.phone_code_expired");
    }
    throw new BadRequestError("auth.phone_code_invalid", { count: left });
  }

  try {
    await markPhoneVerified(user.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new BadRequestError("auth.phone_in_use");
    }
    throw error;
  }

  const verified = await findUserById(user.id);
  return { user: await sanitizeUser(verified!) };
};

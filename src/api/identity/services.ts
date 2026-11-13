import { randomInt, randomUUID } from "crypto";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotAllowedError } from "../../errors/not_allowed";
import { NotFoundError } from "../../errors/not_found_error";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";
import { findUserById } from "../auth/db";
import {
  findObjectStat,
  generateGetPresignedUrl,
  generateUploadPostPolicy,
  readTemplateFile,
  removeObject,
  sendMail,
} from "../../utils/functions";
import {
  identityBucketName,
  identityChallenges,
  identityUploadExpirationSeconds,
  identityVideoLinkExpirationSeconds,
  identityVideoTypes,
  maxIdentityAttempts,
  maxIdentityVideoSizeBytes,
} from "../../utils/constants";
import {
  countRejectedIdentityChecks,
  decideIdentityCheck as saveDecision,
  findIdentityCheckById,
  findIdentityChecksByStatus,
  findLatestDecidedIdentityCheck,
  insertAuditEntries,
  insertIdentityCheck,
  markIdentityCheckSubmitted,
  markIdentityVideoDeleted,
} from "./db";

type VideoType = (typeof identityVideoTypes)[number];
type Decision = "approved" | "rejected";

// Look straight first, then three other moves in a random order, so a
// recording made beforehand can't pass.
const pickChallenges = () => {
  const pool: string[] = [...identityChallenges];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return ["look_straight", ...pool.slice(0, 3)];
};

const expiresAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + identityUploadExpirationSeconds * 1000);

const requireUser = async (userId: number) => {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError("auth.user_not_found");
  }
  return user;
};

// Starts a recording session: the challenges to perform and where to upload
// the video.
export const startIdentityCheck = async (
  userId: number,
  contentType: VideoType,
) => {
  const user = await requireUser(userId);
  if (!user.phoneVerifiedAt) {
    throw new BadRequestError("identity.phone_not_verified");
  }
  if (user.identityStatus === "approved") {
    throw new BadRequestError("identity.already_approved");
  }
  if (user.identityStatus === "pending") {
    throw new BadRequestError("identity.already_pending");
  }
  const rejected = await countRejectedIdentityChecks(user.id);
  if (rejected >= maxIdentityAttempts) {
    throw new NotAllowedError("identity.too_many_attempts");
  }

  const extension = contentType === "video/mp4" ? "mp4" : "webm";
  const check = await insertIdentityCheck({
    userId: user.id,
    challenges: pickChallenges(),
    videoName: `identity-${user.id}-${randomUUID()}.${extension}`,
    contentType,
  });

  let upload;
  try {
    upload = await generateUploadPostPolicy(identityBucketName, check.videoName, {
      maxSizeBytes: maxIdentityVideoSizeBytes,
      contentTypePrefix: "video/",
      expirySeconds: identityUploadExpirationSeconds,
    });
  } catch (error) {
    console.error("Error creating identity video upload policy:", error);
    throw new InternalServerError("identity.upload_url_failed");
  }

  return {
    verification: {
      id: check.id,
      challenges: check.challenges,
      expiresAt: expiresAt(check.createdAt),
    },
    upload: { url: upload.postURL, fields: upload.formData },
    attemptsLeft: maxIdentityAttempts - rejected,
  };
};

// Sends the uploaded video to review, once it is in storage.
export const submitIdentityCheck = async (userId: number, id: number) => {
  const check = await findIdentityCheckById(id);
  if (!check || check.userId !== userId) {
    throw new NotFoundError("identity.not_found");
  }
  if (check.status !== "started") {
    throw new BadRequestError("identity.already_pending");
  }
  if (expiresAt(check.createdAt) < new Date()) {
    throw new BadRequestError("identity.expired");
  }

  const stat = await findObjectStat(identityBucketName, check.videoName);
  if (!stat) {
    throw new BadRequestError("identity.video_missing");
  }
  const type = String(stat.metaData?.["content-type"] ?? "");
  if (
    stat.size <= 0 ||
    stat.size > maxIdentityVideoSizeBytes ||
    !type.startsWith("video/")
  ) {
    await removeObject(identityBucketName, check.videoName).catch(() => {});
    throw new BadRequestError("identity.video_invalid");
  }

  const submitted = await markIdentityCheckSubmitted(check.id, userId);
  if (!submitted) {
    throw new BadRequestError("identity.already_pending");
  }
  return { identityStatus: "pending" as const };
};

export const getMyIdentityStatus = async (userId: number) => {
  const user = await requireUser(userId);
  const [rejected, latest] = await Promise.all([
    countRejectedIdentityChecks(user.id),
    findLatestDecidedIdentityCheck(user.id),
  ]);
  return {
    phoneVerified: user.phoneVerifiedAt !== null,
    identityStatus: user.identityStatus,
    attemptsLeft: Math.max(maxIdentityAttempts - rejected, 0),
    rejectionReason:
      user.identityStatus === "rejected"
        ? (latest?.rejectionReason ?? null)
        : null,
  };
};

// The checks with a given status. Pending ones come with a short-lived link
// to their video; every link handed out is written to the audit log.
export const listIdentityChecks = async (
  adminId: number,
  status: "pending" | Decision,
) => {
  const checks = await findIdentityChecksByStatus(status);
  const items = await Promise.all(
    checks.map(async ({ user, ...check }) => ({
      id: check.id,
      status: check.status,
      challenges: check.challenges,
      submittedAt: check.submittedAt,
      reviewedAt: check.reviewedAt,
      rejectionReason: check.rejectionReason,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role.name,
        createdAt: user.createdAt,
      },
      videoUrl: check.videoDeletedAt
        ? null
        : await generateGetPresignedUrl(
            identityBucketName,
            check.videoName,
            identityVideoLinkExpirationSeconds,
          ),
    })),
  );
  await insertAuditEntries(
    items
      .filter((item) => item.videoUrl !== null)
      .map((item) => ({
        actorUserId: adminId,
        action: "identity.video_viewed",
        targetType: "identity_verification",
        targetId: item.id,
      })),
  );
  return { verifications: items };
};

const notifyUser = async (
  user: { email: string; firstName: string; locale: Parameters<typeof emailTemplateContext>[0] },
  decision: Decision,
  reason: string | null,
) => {
  const key = decision === "approved" ? "identity_approved" : "identity_rejected";
  try {
    const html = await readTemplateFile("identity_review.ejs", {
      ...emailTemplateContext(user.locale),
      key,
      firstName: user.firstName,
      reason: decision === "rejected" ? reason : null,
      link:
        decision === "approved"
          ? `${process.env.CLIENT_URL}/`
          : `${process.env.CLIENT_URL}/verify-identity?lang=${user.locale}`,
    });
    await sendMail({
      to: user.email,
      subject: emailSubject(user.locale, `${key}.subject`),
      html,
    });
  } catch (error) {
    console.error("Error sending identity decision email:", error);
  }
};

// An admin approves or rejects a pending check. The video is deleted either
// way, and the user gets an email.
export const decideIdentityCheck = async (
  adminId: number,
  id: number,
  decision: Decision,
  reason: string | undefined,
) => {
  if (decision === "rejected" && !reason) {
    throw new BadRequestError("identity.reason_required");
  }
  const decided = await saveDecision({
    id,
    adminId,
    decision,
    reason: reason ?? null,
  });
  if (!decided) {
    const existing = await findIdentityCheckById(id);
    if (!existing) {
      throw new NotFoundError("identity.not_found");
    }
    throw new BadRequestError("identity.not_pending");
  }

  try {
    await removeObject(identityBucketName, decided.videoName);
    await markIdentityVideoDeleted(decided.id);
  } catch (error) {
    console.error("Error deleting identity video:", error);
  }

  const user = await findUserById(decided.userId);
  if (user) {
    await notifyUser(user, decision, decided.rejectionReason);
  }

  return {
    verification: {
      id: decided.id,
      status: decided.status,
      reviewedAt: decided.reviewedAt,
      rejectionReason: decided.rejectionReason,
    },
  };
};

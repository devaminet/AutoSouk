import { TransactionRollbackError } from "drizzle-orm";
import { db } from "../../db";
import { BadRequestError } from "../../errors/bad_request_error";
import { NotFoundError } from "../../errors/not_found_error";
import { translate } from "../../i18n";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";
import {
  identityBucketName,
  identityVideoLinkExpirationSeconds,
  maxIdentityAttempts,
} from "../../utils/constants";
import {
  generateGetPresignedUrl,
  readTemplateFile,
  removeObject,
  sendMail,
} from "../../utils/functions";
import { findUserForAdmin } from "../admin/db";
import {
  decideIdentityCheck,
  insertAuditEntries,
  markIdentityVideoDeleted,
} from "../identity/db";
import { findPendingDocuments, saveDecisions } from "../mechanic_verification/db";
import type { DocumentDecision, MechanicDocumentType } from "../mechanic_verification/db";
import {
  checkDocumentDecisions,
  getReview,
  removeFiles,
  requiredFor,
} from "../mechanic_verification/services";
import { findDecidedFaceChecks, findPendingFaceCheck, findVerificationQueue } from "./db";

type Decision = "approved" | "rejected";

export type FaceCheckDecision = { decision: Decision; reason: string | null };

// Everyone waiting for an admin, with what waits: the face video, documents
// or both.
export const listVerifications = async () => {
  const rows = await findVerificationQueue();
  return {
    verifications: rows.map((row) => ({
      user: {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        role: row.role,
      },
      mechanic: row.mechanicName ? { name: row.mechanicName, kind: row.kind } : null,
      waiting: {
        faceCheck: row.faceCheckSince !== null,
        documents: row.pendingDocuments,
      },
      since: row.since,
      resent: row.resent,
    })),
  };
};

// Everything one user sent, to decide on it in one place: their profile and
// checks, the face video waiting with the challenges asked, earlier face
// checks, and for a mechanic their documents. The video link lasts 10 minutes
// and is written to the audit log.
export const getVerification = async (adminId: number, userId: number) => {
  const user = await findUserForAdmin(userId);
  if (!user) {
    throw new NotFoundError("admin.user_not_found");
  }
  const [pending, decided] = await Promise.all([
    findPendingFaceCheck(userId),
    findDecidedFaceChecks(userId),
  ]);
  let faceCheck = null;
  if (pending && !pending.videoDeletedAt) {
    const videoUrl = await generateGetPresignedUrl(
      identityBucketName,
      pending.videoName,
      identityVideoLinkExpirationSeconds,
    );
    await insertAuditEntries([
      {
        actorUserId: adminId,
        action: "identity.video_viewed",
        targetType: "identity_verification",
        targetId: pending.id,
      },
    ]);
    faceCheck = {
      id: pending.id,
      challenges: pending.challenges,
      submittedAt: pending.submittedAt,
      contentType: pending.contentType,
      videoUrl,
    };
  }
  const review = user.role.name === "mechanic" ? await getReview(userId) : null;
  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role.name,
      emailVerified: user.isVerified,
      phoneVerifiedAt: user.phoneVerifiedAt,
      identityStatus: user.identityStatus,
      locale: user.locale,
      city: user.city,
      suspendedAt: user.suspendedAt,
      createdAt: user.createdAt,
    },
    faceCheck,
    faceCheckHistory: decided,
    attempts: {
      rejected: decided.filter((check) => check.status === "rejected").length,
      max: maxIdentityAttempts,
    },
    mechanic: user.mechanic ? { id: user.mechanic.id, name: user.mechanic.name, city: user.mechanic.city } : null,
    documents: review && {
      kind: review.kind,
      status: review.status,
      bookable: review.bookable,
      validUntil: review.validUntil,
      requiredTypes: review.requiredTypes,
      expiringTypes: review.expiringTypes,
      documents: review.documents,
    },
  };
};

type ReviewedItem = { label: string; approved: boolean; reason: string | null };

// One email for the whole decision: each item approved or to send again,
// with the reasons.
const notifyUser = async (
  userId: number,
  items: ReviewedItem[],
  faceRejected: boolean,
  documentsRejected: boolean,
) => {
  const user = await findUserForAdmin(userId);
  if (!user) {
    return;
  }
  const approved = !faceRejected && !documentsRejected;
  const key = approved ? "verification_approved" : "verification_rejected";
  const path = faceRejected ? "/verify-identity" : documentsRejected ? "/mechanic/documents" : "/";
  try {
    const html = await readTemplateFile("verification_review.ejs", {
      ...emailTemplateContext(user.locale),
      key,
      firstName: user.firstName,
      items,
      link: `${process.env.CLIENT_URL}${path}?lang=${user.locale}`,
    });
    await sendMail({ to: user.email, subject: emailSubject(user.locale, `${key}.subject`), html });
  } catch (error) {
    console.error("Error sending verification decision email:", error);
  }
};

// Decides everything the user sent in one go: the face check waiting, and
// every document waiting. Both are saved together, or neither is. The face
// video, and the files of rejected or replaced documents, are deleted after.
export const decideVerification = async (
  adminId: number,
  userId: number,
  body: { faceCheck?: FaceCheckDecision; documents?: DocumentDecision[] },
) => {
  const user = await findUserForAdmin(userId);
  if (!user) {
    throw new NotFoundError("admin.user_not_found");
  }
  const [faceCheck, pendingDocuments] = await Promise.all([
    findPendingFaceCheck(userId),
    findPendingDocuments(userId),
  ]);
  if (!faceCheck && pendingDocuments.length === 0) {
    throw new BadRequestError("admin.nothing_to_review");
  }
  if (faceCheck && !body.faceCheck) {
    throw new BadRequestError("admin.face_check_decision_required");
  }
  if (!faceCheck && body.faceCheck) {
    throw new BadRequestError("identity.not_pending");
  }
  if (body.faceCheck?.decision === "rejected" && !body.faceCheck.reason) {
    throw new BadRequestError("identity.reason_required");
  }
  const documentDecisions = body.documents ?? [];
  if (pendingDocuments.length > 0 || documentDecisions.length > 0) {
    checkDocumentDecisions(pendingDocuments, documentDecisions);
  }

  let filesToDelete: { id: number; fileName: string }[] = [];
  try {
    await db.transaction(async (tx) => {
      if (faceCheck && body.faceCheck) {
        const decided = await decideIdentityCheck(
          {
            id: faceCheck.id,
            adminId,
            decision: body.faceCheck.decision,
            reason: body.faceCheck.reason,
          },
          tx,
        );
        if (!decided) {
          tx.rollback();
        }
      }
      if (documentDecisions.length > 0) {
        const result = await saveDecisions(
          { userId, adminId, decisions: documentDecisions, required: requiredFor },
          tx,
        );
        filesToDelete = result.filesToDelete;
      }
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) {
      throw new BadRequestError("admin.review_changed");
    }
    throw error;
  }

  if (faceCheck) {
    try {
      await removeObject(identityBucketName, faceCheck.videoName);
      await markIdentityVideoDeleted(faceCheck.id);
    } catch (error) {
      console.error("Error deleting identity video:", error);
    }
  }
  await removeFiles(filesToDelete);

  const items: ReviewedItem[] = [];
  if (body.faceCheck) {
    items.push({
      label: translate(user.locale, "emails:verification_review.face_check"),
      approved: body.faceCheck.decision === "approved",
      reason: body.faceCheck.reason,
    });
  }
  for (const decision of documentDecisions) {
    const document = pendingDocuments.find((doc) => doc.id === decision.documentId);
    const type: MechanicDocumentType | undefined = document?.type;
    if (type) {
      items.push({
        label: translate(user.locale, `enums:mechanic_document_type.${type}`),
        approved: decision.decision === "approved",
        reason: decision.reason,
      });
    }
  }
  await notifyUser(
    userId,
    items,
    body.faceCheck?.decision === "rejected",
    documentDecisions.some((decision) => decision.decision === "rejected"),
  );

  return getVerification(adminId, userId);
};

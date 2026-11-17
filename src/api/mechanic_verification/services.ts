import { randomUUID } from "crypto";
import { TransactionRollbackError } from "drizzle-orm";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";
import { translate } from "../../i18n";
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
  expiringMechanicDocuments,
  maxMechanicDocumentSizeBytes,
  mechanicDocumentContentTypes,
  mechanicDocumentLinkExpirationSeconds,
  mechanicDocumentsBucketName,
  mechanicDocumentUploadExpirationSeconds,
  requiredMechanicDocuments,
} from "../../utils/constants";
import {
  deleteDocuments,
  findDocumentById,
  findDocuments,
  findDrafts,
  findPendingDocuments,
  findPendingReviews,
  findReviewSubject,
  findVerification,
  hasPendingOrApproved,
  hasReviewedDocuments,
  insertAuditEntry,
  insertDocument,
  markFilesDeleted,
  markUploaded,
  saveDecisions,
  saveKind,
  submitUploaded,
  today,
} from "./db";
import type {
  DocumentDecision,
  MechanicDocument,
  MechanicDocumentType,
  MechanicKind,
} from "./db";

type ContentType = (typeof mechanicDocumentContentTypes)[number];

// Where the mechanic stands with their documents.
export type VerificationStatus = "not_submitted" | "pending" | "approved" | "rejected" | "expired";

const extensions: Record<ContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

export const requiredFor = (kind: MechanicKind): readonly MechanicDocumentType[] =>
  requiredMechanicDocuments[kind];

const isExpired = (validUntil: string | null) => validUntil !== null && validUntil < today();

const uploadExpiresAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + mechanicDocumentUploadExpirationSeconds * 1000);

const toDocument = (document: MechanicDocument) => ({
  id: document.id,
  type: document.type,
  status: document.status,
  contentType: document.contentType,
  sizeBytes: document.sizeBytes,
  validUntil: document.validUntil,
  expired: document.status === "approved" && isExpired(document.validUntil),
  rejectionReason: document.rejectionReason,
  submittedAt: document.submittedAt,
  reviewedAt: document.reviewedAt,
  createdAt: document.createdAt,
});

// The latest document of each type: what the mechanic sees for that type.
const latestByType = (documents: MechanicDocument[]) => {
  const latest = new Map<MechanicDocumentType, MechanicDocument>();
  for (const document of documents) {
    latest.set(document.type, document);
  }
  return latest;
};

const standing = (
  verification: Awaited<ReturnType<typeof findVerification>>,
  documents: MechanicDocument[],
) => {
  const bookable =
    verification?.approvedAt != null && !isExpired(verification.validUntil);
  const required = verification ? requiredFor(verification.kind) : [];
  const latest = latestByType(documents.filter((doc) => required.includes(doc.type)));
  let status: VerificationStatus = "not_submitted";
  if ([...latest.values()].some((doc) => doc.status === "pending")) {
    status = "pending";
  } else if (bookable) {
    status = "approved";
  } else if ([...latest.values()].some((doc) => doc.status === "rejected")) {
    status = "rejected";
  } else if (verification?.approvedAt != null) {
    status = "expired";
  }
  return { status, bookable, required };
};

// The mechanic's documents and where they stand.
export const getMyVerification = async (userId: number) => {
  const [verification, documents] = await Promise.all([
    findVerification(userId),
    findDocuments(userId),
  ]);
  const { status, bookable, required } = standing(verification, documents);
  return {
    kind: verification?.kind ?? null,
    status,
    bookable,
    approvedAt: verification?.approvedAt ?? null,
    validUntil: verification?.validUntil ?? null,
    requiredTypes: required,
    documents: documents.map(toDocument),
  };
};

// Chooses solo or garage. Fixed once a document is waiting or approved, as
// the admin checked the documents of that kind.
export const chooseKind = async (userId: number, kind: MechanicKind) => {
  const verification = await findVerification(userId);
  if (verification?.kind !== kind && (await hasPendingOrApproved(userId))) {
    throw new BadRequestError("mechanic_documents.kind_locked");
  }
  await saveKind(userId, kind);
  return getMyVerification(userId);
};

export const removeFiles = async (documents: { id: number; fileName: string }[]) => {
  const removed: number[] = [];
  for (const document of documents) {
    try {
      await removeObject(mechanicDocumentsBucketName, document.fileName);
      removed.push(document.id);
    } catch (error) {
      console.error("Error deleting a mechanic document:", error);
    }
  }
  await markFilesDeleted(removed);
};

// Gives an upload link for one document. It takes the place of the type's
// document not sent yet, if any.
export const startDocumentUpload = async (
  userId: number,
  type: MechanicDocumentType,
  contentType: ContentType,
) => {
  const verification = await findVerification(userId);
  if (!verification) {
    throw new BadRequestError("mechanic_documents.kind_required");
  }
  if (!requiredFor(verification.kind).includes(type)) {
    throw new BadRequestError("mechanic_documents.type_not_needed");
  }
  const documents = await findDocuments(userId);
  if (documents.some((doc) => doc.type === type && doc.status === "pending")) {
    throw new BadRequestError("mechanic_documents.already_pending");
  }

  const drafts = await findDrafts(userId, type);
  await removeFiles(drafts.filter((doc) => doc.status === "uploaded"));
  await deleteDocuments(drafts.map((doc) => doc.id));

  const document = await insertDocument({
    userId,
    type,
    fileName: `${userId}/${type}-${randomUUID()}.${extensions[contentType]}`,
    contentType,
  });
  let upload;
  try {
    upload = await generateUploadPostPolicy(mechanicDocumentsBucketName, document.fileName, {
      maxSizeBytes: maxMechanicDocumentSizeBytes,
      contentTypePrefix: contentType,
      expirySeconds: mechanicDocumentUploadExpirationSeconds,
    });
  } catch (error) {
    console.error("Error creating a mechanic document upload policy:", error);
    await deleteDocuments([document.id]);
    throw new InternalServerError("mechanic_documents.upload_url_failed");
  }
  return {
    document: { id: document.id, type: document.type, expiresAt: uploadExpiresAt(document.createdAt) },
    upload: { url: upload.postURL, fields: upload.formData },
  };
};

// Records that the file arrived, once it is in storage.
export const confirmDocumentUpload = async (userId: number, id: number) => {
  const document = await findDocumentById(id);
  if (!document || document.userId !== userId) {
    throw new NotFoundError("mechanic_documents.not_found");
  }
  if (document.status !== "uploading") {
    throw new BadRequestError("mechanic_documents.already_uploaded");
  }
  const stat = await findObjectStat(mechanicDocumentsBucketName, document.fileName);
  if (!stat) {
    if (uploadExpiresAt(document.createdAt) < new Date()) {
      await deleteDocuments([document.id]);
      throw new BadRequestError("mechanic_documents.expired");
    }
    throw new BadRequestError("mechanic_documents.file_missing");
  }
  const type = String(stat.metaData?.["content-type"] ?? "");
  if (stat.size <= 0 || stat.size > maxMechanicDocumentSizeBytes || type !== document.contentType) {
    await removeObject(mechanicDocumentsBucketName, document.fileName).catch(() => {});
    await deleteDocuments([document.id]);
    throw new BadRequestError("mechanic_documents.file_invalid");
  }
  const uploaded = await markUploaded(document.id, userId, stat.size);
  if (!uploaded) {
    throw new BadRequestError("mechanic_documents.already_uploaded");
  }
  return { document: toDocument(uploaded) };
};

// Takes back a document not sent yet.
export const removeDraftDocument = async (userId: number, id: number) => {
  const document = await findDocumentById(id);
  if (!document || document.userId !== userId) {
    throw new NotFoundError("mechanic_documents.not_found");
  }
  if (document.status !== "uploading" && document.status !== "uploaded") {
    throw new BadRequestError("mechanic_documents.not_removable");
  }
  if (document.status === "uploaded") {
    await removeFiles([document]);
  }
  await deleteDocuments([document.id]);
};

// Sends the stored documents to review. Every required document must be
// stored, waiting or approved and still valid.
export const submitDocuments = async (userId: number) => {
  const verification = await findVerification(userId);
  if (!verification) {
    throw new BadRequestError("mechanic_documents.kind_required");
  }
  const documents = await findDocuments(userId);
  const ready = (type: MechanicDocumentType) =>
    documents.some(
      (doc) =>
        doc.type === type &&
        (doc.status === "uploaded" ||
          doc.status === "pending" ||
          (doc.status === "approved" && !isExpired(doc.validUntil))),
    );
  const missing = requiredFor(verification.kind).filter((type) => !ready(type));
  if (missing.length > 0) {
    throw new BadRequestError("mechanic_documents.incomplete", { count: missing.length });
  }
  const required = requiredFor(verification.kind);
  if (!documents.some((doc) => doc.status === "uploaded" && required.includes(doc.type))) {
    throw new BadRequestError("mechanic_documents.nothing_to_send");
  }
  await submitUploaded(userId);
  return getMyVerification(userId);
};

// The mechanics waiting for a review, longest waiting first.
export const listPendingReviews = async () => {
  const rows = await findPendingReviews();
  const reviews = await Promise.all(
    rows.map(async (row) => ({
      user: {
        id: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
      },
      kind: row.kind,
      mechanic: row.mechanicName ? { name: row.mechanicName, city: row.cityName } : null,
      pendingCount: row.pendingCount,
      submittedAt: row.submittedAt,
      resent: await hasReviewedDocuments(row.userId),
    })),
  );
  return { reviews };
};

// One mechanic's checks and documents, for the admin to decide.
export const getReview = async (userId: number) => {
  const subject = await findReviewSubject(userId);
  if (!subject || subject.user.role.name !== "mechanic") {
    throw new NotFoundError("mechanic_documents.mechanic_not_found");
  }
  const [verification, documents] = await Promise.all([
    findVerification(userId),
    findDocuments(userId),
  ]);
  const { status, bookable, required } = standing(verification, documents);
  return {
    user: {
      id: subject.user.id,
      firstName: subject.user.firstName,
      lastName: subject.user.lastName,
      email: subject.user.email,
      phone: subject.user.phone,
      phoneVerified: subject.user.phoneVerifiedAt !== null,
      identityStatus: subject.user.identityStatus,
      createdAt: subject.user.createdAt,
    },
    mechanic: subject.mechanic,
    kind: verification?.kind ?? null,
    status,
    bookable,
    approvedAt: verification?.approvedAt ?? null,
    validUntil: verification?.validUntil ?? null,
    requiredTypes: required,
    expiringTypes: expiringMechanicDocuments,
    // Documents not sent yet are the mechanic's own business.
    documents: documents.filter((doc) => doc.status !== "uploaded").map(toDocument),
  };
};

// A short link to one document's file, for an admin. Every link handed out
// is written to the audit log.
export const getDocumentLink = async (adminId: number, id: number) => {
  const document = await findDocumentById(id);
  if (
    !document ||
    document.fileDeletedAt ||
    !["pending", "approved"].includes(document.status)
  ) {
    throw new NotFoundError("mechanic_documents.not_found");
  }
  const url = await generateGetPresignedUrl(
    mechanicDocumentsBucketName,
    document.fileName,
    mechanicDocumentLinkExpirationSeconds,
  );
  await insertAuditEntry({
    actorUserId: adminId,
    action: "mechanic_document.viewed",
    targetType: "mechanic_document",
    targetId: document.id,
  });
  return {
    url,
    contentType: document.contentType,
    expiresAt: new Date(Date.now() + mechanicDocumentLinkExpirationSeconds * 1000),
  };
};

const notifyMechanic = async (
  userId: number,
  approved: boolean,
  rejected: { type: MechanicDocumentType; reason: string | null }[],
) => {
  const user = await findUserById(userId);
  if (!user) {
    return;
  }
  const key = approved ? "mechanic_documents_approved" : "mechanic_documents_rejected";
  try {
    const html = await readTemplateFile("mechanic_documents_review.ejs", {
      ...emailTemplateContext(user.locale),
      key,
      firstName: user.firstName,
      rejected: rejected.map((doc) => ({
        label: translate(user.locale, `enums:mechanic_document_type.${doc.type}`),
        reason: doc.reason,
      })),
      link: `${process.env.CLIENT_URL}/mechanic/documents?lang=${user.locale}`,
    });
    await sendMail({ to: user.email, subject: emailSubject(user.locale, `${key}.subject`), html });
  } catch (error) {
    console.error("Error sending mechanic documents decision email:", error);
  }
};

// A decision must cover every pending document. A rejection needs a reason;
// approving a document that expires needs its end date, not in the past.
export const checkDocumentDecisions = (
  pending: { id: number; type: MechanicDocumentType }[],
  decisions: DocumentDecision[],
) => {
  if (pending.length === 0) {
    throw new BadRequestError("mechanic_documents.not_pending");
  }
  const decided = new Set(decisions.map((decision) => decision.documentId));
  if (decided.size !== decisions.length || pending.length !== decided.size || pending.some((doc) => !decided.has(doc.id))) {
    throw new BadRequestError("mechanic_documents.decisions_incomplete");
  }
  for (const decision of decisions) {
    const document = pending.find((doc) => doc.id === decision.documentId)!;
    if (decision.decision === "rejected" && !decision.reason) {
      throw new BadRequestError("mechanic_documents.reason_required");
    }
    if (decision.decision === "approved") {
      if (expiringMechanicDocuments.includes(document.type) && !decision.validUntil) {
        throw new BadRequestError("mechanic_documents.valid_until_required");
      }
      if (decision.validUntil && decision.validUntil < today()) {
        throw new BadRequestError("mechanic_documents.already_expired");
      }
    }
  }
};

// An admin decides every pending document of a mechanic at once.
export const decideDocuments = async (
  adminId: number,
  userId: number,
  decisions: DocumentDecision[],
) => {
  const pending = await findPendingDocuments(userId);
  checkDocumentDecisions(pending, decisions);

  let result;
  try {
    result = await saveDecisions({ userId, adminId, decisions, required: requiredFor });
  } catch (error) {
    if (error instanceof TransactionRollbackError) {
      throw new BadRequestError("mechanic_documents.not_pending");
    }
    throw error;
  }
  await removeFiles(result.filesToDelete);

  const rejected = decisions
    .filter((decision) => decision.decision === "rejected")
    .map((decision) => ({
      type: pending.find((doc) => doc.id === decision.documentId)!.type,
      reason: decision.reason,
    }));
  const bookable = result.verification?.approvedAt != null && !isExpired(result.verification.validUntil);
  if (rejected.length > 0 || bookable) {
    await notifyMechanic(userId, rejected.length === 0, rejected);
  }
  return getReview(userId);
};

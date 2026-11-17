import request from "supertest";
import { and, eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { auditLogTable } from "../../../db/schema/audit_log";
import { usersTable } from "../../../db/schema/user";
import {
  mechanicDocumentsTable,
  mechanicVerificationsTable,
} from "../../../db/schema/mechanic_verification";
import { minioClient } from "../../../file_storage/minio";
import { mechanicDocumentsBucketName } from "../../../utils/constants";
import * as fileUtils from "../../../utils/functions";
import { createBucket } from "../../../utils/functions";
import { cityCentre, signinUser, signupUserWithVerification } from "../../../test/helpers";
import { createApprovedCar, createBuyer } from "../../inspections/__test__/fixtures";

type Session = { accessToken: string; user: { id: number } };

const mechanicEmail = "mechanic@example.com";

const signUpMechanic = async () => {
  await signupUserWithVerification({
    userType: "mechanic",
    email: mechanicEmail,
    mechanicDocumentsApproved: false,
  });
  return (await signinUser({ email: mechanicEmail })) as Session;
};

const signInAdmin = async () =>
  (await signinUser({ email: "admin@autosouk.com", password: "Admin_@@789" })) as Session;

const as = (session: Session) => ({
  get: (path: string) => request(app).get(path).auth(session.accessToken, { type: "bearer" }),
  post: (path: string, body?: object) =>
    request(app).post(path).send(body).auth(session.accessToken, { type: "bearer" }),
  put: (path: string, body?: object) =>
    request(app).put(path).send(body).auth(session.accessToken, { type: "bearer" }),
  delete: (path: string) => request(app).delete(path).auth(session.accessToken, { type: "bearer" }),
});

// Uploads a document the way the browser does: a link from the API, the file
// straight to storage, then a confirmation.
const upload = async (
  mechanic: Session,
  type: string,
  contentType = "application/pdf",
) => {
  const started = await as(mechanic)
    .post("/api/mechanic-documents/me/documents", { type, contentType })
    .expect(201);
  const id = started.body.document.id as number;
  const [row] = await db
    .select({ fileName: mechanicDocumentsTable.fileName })
    .from(mechanicDocumentsTable)
    .where(eq(mechanicDocumentsTable.id, id));
  await minioClient.putObject(mechanicDocumentsBucketName, row.fileName, Buffer.from("%PDF-1.4"), 8, {
    "Content-Type": contentType,
  });
  await as(mechanic).post(`/api/mechanic-documents/me/documents/${id}/confirm`).expect(200);
  return { id, fileName: row.fileName };
};

const fileExists = async (fileName: string) =>
  minioClient.statObject(mechanicDocumentsBucketName, fileName).then(
    () => true,
    () => false,
  );

const nextYear = `${new Date().getUTCFullYear() + 1}-12-31`;

const garageTypes = ["cin_front", "cin_back", "rc", "patente", "ice", "premises"];

const uploadAll = async (mechanic: Session, types: string[]) => {
  const ids: Record<string, { id: number; fileName: string }> = {};
  for (const type of types) {
    ids[type] = await upload(mechanic, type);
  }
  return ids;
};

const approveAll = (ids: Record<string, { id: number }>) =>
  Object.entries(ids).map(([type, { id }]) => ({
    documentId: id,
    decision: "approved",
    ...(["cin_front", "cin_back", "patente"].includes(type) ? { validUntil: nextYear } : {}),
  }));

beforeAll(async () => {
  await createBucket(mechanicDocumentsBucketName);
});

afterEach(async () => {
  await db.delete(mechanicDocumentsTable);
  await db.delete(mechanicVerificationsTable);
});

describe("a mechanic's documents", () => {
  it("goes from upload to review to bookable", async () => {
    const mechanic = await signUpMechanic();
    const admin = await signInAdmin();

    const empty = await as(mechanic).get("/api/mechanic-documents/me").expect(200);
    expect(empty.body).toMatchObject({ kind: null, status: "not_submitted", bookable: false, documents: [] });

    const solo = await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "solo" }).expect(200);
    expect(solo.body.requiredTypes).toEqual(["cin_front", "cin_back"]);

    const ids = await uploadAll(mechanic, ["cin_front", "cin_back"]);
    const sent = await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);
    expect(sent.body.status).toBe("pending");
    expect(sent.body.documents.map((doc: { status: string }) => doc.status)).toEqual(["pending", "pending"]);

    const queue = await as(admin).get("/api/mechanic-documents/reviews").expect(200);
    expect(queue.body.reviews).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ id: mechanic.user.id }), kind: "solo", pendingCount: 2, resent: false }),
    ]);

    const link = await as(admin).get(`/api/mechanic-documents/documents/${ids.cin_front.id}/link`).expect(200);
    expect(link.body.url).toContain(mechanicDocumentsBucketName);
    const views = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.action, "mechanic_document.viewed"), eq(auditLogTable.targetId, ids.cin_front.id)));
    expect(views).toHaveLength(1);

    const sendMail = fileUtils.sendMail as jest.Mock;
    sendMail.mockClear();
    const decided = await as(admin)
      .post(`/api/mechanic-documents/reviews/${mechanic.user.id}/decisions`, { decisions: approveAll(ids) })
      .expect(200);
    expect(decided.body).toMatchObject({ status: "approved", bookable: true, validUntil: nextYear });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Your documents are approved" }));

    const mine = await as(mechanic).get("/api/mechanic-documents/me").expect(200);
    expect(mine.body).toMatchObject({ status: "approved", bookable: true });
  });

  it("asks again only for the rejected document, and deletes its file", async () => {
    const mechanic = await signUpMechanic();
    const admin = await signInAdmin();
    await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "garage" }).expect(200);
    const ids = await uploadAll(mechanic, garageTypes);
    await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);

    const decisions = approveAll(ids).map((decision) =>
      decision.documentId === ids.patente.id
        ? { documentId: ids.patente.id, decision: "rejected", reason: "Expired on 31 Dec 2025" }
        : decision,
    );
    const decided = await as(admin)
      .post(`/api/mechanic-documents/reviews/${mechanic.user.id}/decisions`, { decisions })
      .expect(200);
    expect(decided.body).toMatchObject({ status: "rejected", bookable: false });
    expect(await fileExists(ids.patente.fileName)).toBe(false);
    expect(await fileExists(ids.rc.fileName)).toBe(true);

    const mine = await as(mechanic).get("/api/mechanic-documents/me").expect(200);
    expect(mine.body.documents.find((doc: { type: string }) => doc.type === "patente")).toMatchObject({
      status: "rejected",
      rejectionReason: "Expired on 31 Dec 2025",
    });

    const patente = await upload(mechanic, "patente");
    await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);
    const queue = await as(admin).get("/api/mechanic-documents/reviews").expect(200);
    expect(queue.body.reviews[0]).toMatchObject({ pendingCount: 1, resent: true });

    const again = await as(admin)
      .post(`/api/mechanic-documents/reviews/${mechanic.user.id}/decisions`, {
        decisions: [{ documentId: patente.id, decision: "approved", validUntil: nextYear }],
      })
      .expect(200);
    expect(again.body).toMatchObject({ status: "approved", bookable: true });
  });

  it("keeps the mechanic bookable while a renewed document waits, then replaces the old one", async () => {
    const mechanic = await signUpMechanic();
    const admin = await signInAdmin();
    await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "garage" }).expect(200);
    const ids = await uploadAll(mechanic, garageTypes);
    await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);
    await as(admin)
      .post(`/api/mechanic-documents/reviews/${mechanic.user.id}/decisions`, { decisions: approveAll(ids) })
      .expect(200);

    const renewed = await upload(mechanic, "patente");
    const waiting = await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);
    expect(waiting.body).toMatchObject({ status: "pending", bookable: true });

    const later = `${new Date().getUTCFullYear() + 2}-12-31`;
    await as(admin)
      .post(`/api/mechanic-documents/reviews/${mechanic.user.id}/decisions`, {
        decisions: [{ documentId: renewed.id, decision: "approved", validUntil: later }],
      })
      .expect(200);
    expect(await fileExists(ids.patente.fileName)).toBe(false);
    const mine = await as(mechanic).get("/api/mechanic-documents/me").expect(200);
    expect(mine.body.documents.filter((doc: { type: string }) => doc.type === "patente")).toHaveLength(1);
    expect(mine.body.validUntil).toBe(nextYear);
  });

  it("stops bookings once a document expires", async () => {
    const mechanic = await signUpMechanic();
    await db.insert(mechanicVerificationsTable).values({
      userId: mechanic.user.id,
      kind: "solo",
      approvedAt: new Date(),
      validUntil: "2020-01-01",
    });

    const mine = await as(mechanic).get("/api/mechanic-documents/me").expect(200);
    expect(mine.body).toMatchObject({ status: "expired", bookable: false });
  });

  it("checks what the mechanic sends", async () => {
    const mechanic = await signUpMechanic();

    const noKind = await as(mechanic)
      .post("/api/mechanic-documents/me/documents", { type: "cin_front", contentType: "image/jpeg" })
      .expect(400);
    expect(noKind.body.errors[0].code).toBe("mechanic_documents.kind_required");

    await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "solo" }).expect(200);
    const notNeeded = await as(mechanic)
      .post("/api/mechanic-documents/me/documents", { type: "patente", contentType: "image/jpeg" })
      .expect(400);
    expect(notNeeded.body.errors[0].code).toBe("mechanic_documents.type_not_needed");

    await as(mechanic)
      .post("/api/mechanic-documents/me/documents", { type: "cin_front", contentType: "image/gif" })
      .expect(400);

    const started = await as(mechanic)
      .post("/api/mechanic-documents/me/documents", { type: "cin_front", contentType: "image/jpeg" })
      .expect(201);
    const missing = await as(mechanic)
      .post(`/api/mechanic-documents/me/documents/${started.body.document.id}/confirm`)
      .expect(400);
    expect(missing.body.errors[0].code).toBe("mechanic_documents.file_missing");

    const incomplete = await as(mechanic).post("/api/mechanic-documents/me/submit").expect(400);
    expect(incomplete.body.errors[0]).toMatchObject({
      code: "mechanic_documents.incomplete",
      message: "2 documents are still missing",
    });

    await uploadAll(mechanic, ["cin_front", "cin_back"]);
    await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);
    const locked = await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "garage" }).expect(400);
    expect(locked.body.errors[0].code).toBe("mechanic_documents.kind_locked");
  });

  it("replaces a document not sent yet and deletes its file", async () => {
    const mechanic = await signUpMechanic();
    await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "solo" }).expect(200);
    const first = await upload(mechanic, "cin_front");
    const second = await upload(mechanic, "cin_front");

    expect(await fileExists(first.fileName)).toBe(false);
    const mine = await as(mechanic).get("/api/mechanic-documents/me").expect(200);
    expect(mine.body.documents.map((doc: { id: number }) => doc.id)).toEqual([second.id]);

    await as(mechanic).delete(`/api/mechanic-documents/me/documents/${second.id}`).expect(204);
    expect(await fileExists(second.fileName)).toBe(false);
  });

  it("checks the admin's decisions", async () => {
    const mechanic = await signUpMechanic();
    const admin = await signInAdmin();
    await as(mechanic).put("/api/mechanic-documents/me/kind", { kind: "solo" }).expect(200);
    const ids = await uploadAll(mechanic, ["cin_front", "cin_back"]);
    await as(mechanic).post("/api/mechanic-documents/me/submit").expect(200);
    const decide = (decisions: object[]) =>
      as(admin).post(`/api/mechanic-documents/reviews/${mechanic.user.id}/decisions`, { decisions }).expect(400);

    const partial = await decide([{ documentId: ids.cin_front.id, decision: "approved", validUntil: nextYear }]);
    expect(partial.body.errors[0].code).toBe("mechanic_documents.decisions_incomplete");

    const noReason = await decide([
      { documentId: ids.cin_front.id, decision: "approved", validUntil: nextYear },
      { documentId: ids.cin_back.id, decision: "rejected" },
    ]);
    expect(noReason.body.errors[0].code).toBe("mechanic_documents.reason_required");

    const noDate = await decide([
      { documentId: ids.cin_front.id, decision: "approved" },
      { documentId: ids.cin_back.id, decision: "approved", validUntil: nextYear },
    ]);
    expect(noDate.body.errors[0].code).toBe("mechanic_documents.valid_until_required");

    const past = await decide([
      { documentId: ids.cin_front.id, decision: "approved", validUntil: "2020-01-01" },
      { documentId: ids.cin_back.id, decision: "approved", validUntil: nextYear },
    ]);
    expect(past.body.errors[0].code).toBe("mechanic_documents.already_expired");
  });

  it("keeps the review routes for admins and the mechanic routes for mechanics", async () => {
    const mechanic = await signUpMechanic();
    const buyer = await createBuyer("buyer@example.com");

    await as(mechanic).get("/api/mechanic-documents/reviews").expect(403);
    await as(mechanic).get(`/api/mechanic-documents/reviews/${mechanic.user.id}`).expect(403);
    await as(buyer).get("/api/mechanic-documents/me").expect(403);
    await request(app).get("/api/mechanic-documents/me").expect(401);
  });
});

describe("booking a mechanic", () => {
  const createProfile = async (mechanic: Session) =>
    as(mechanic)
      .post("/api/mechanics", {
        name: "Garage Atlas Auto",
        cityId: 1,
        address: "27 Rue Ibnou Mounir",
        ...(await cityCentre(1)),
        inspectionPrice: 350,
      })
      .expect(201);

  it("hides a mechanic from buyers until the documents are approved", async () => {
    const mechanic = await signUpMechanic();
    const profile = await createProfile(mechanic);
    const mechanicId = profile.body.mechanic.id as number;
    const { carId, listingId } = await createApprovedCar("seller@example.com");
    const buyer = await createBuyer("buyer@example.com");

    await as(buyer).get(`/api/mechanics/${mechanicId}`).expect(404);
    await as(mechanic).get(`/api/mechanics/${mechanicId}`).expect(200);
    const listed = await request(app).get(`/api/listings/${listingId}/mechanics`).expect(200);
    expect(listed.body.mechanics).toEqual([]);
    const rankings = await request(app).get("/api/mechanics/rankings?cityId=1").expect(200);
    expect(rankings.body.rankings).toEqual([]);
    await as(buyer).post("/api/inspections", { carId, mechanicId }).expect(404);

    await db.insert(mechanicVerificationsTable).values({ userId: mechanic.user.id, kind: "solo", approvedAt: new Date() });
    // Approved documents aren't enough while the face check isn't approved.
    await as(buyer).get(`/api/mechanics/${mechanicId}`).expect(404);
    await db.update(usersTable).set({ identityStatus: "approved" }).where(eq(usersTable.id, mechanic.user.id));

    await as(buyer).get(`/api/mechanics/${mechanicId}`).expect(200);
    const listedAfter = await request(app).get(`/api/listings/${listingId}/mechanics`).expect(200);
    expect(listedAfter.body.mechanics.map((m: { id: number }) => m.id)).toEqual([mechanicId]);
    await as(buyer).post("/api/inspections", { carId, mechanicId }).expect(201);
  });
});

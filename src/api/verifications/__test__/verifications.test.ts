import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { auditLogTable } from "../../../db/schema/audit_log";
import { identityVerificationsTable } from "../../../db/schema/identity_verification";
import {
  mechanicDocumentsTable,
  mechanicVerificationsTable,
} from "../../../db/schema/mechanic_verification";
import { usersTable } from "../../../db/schema/user";
import { signinUser } from "../../../test/helpers";
import * as fileUtils from "../../../utils/functions";
import { createBuyer, createMechanic } from "../../inspections/__test__/fixtures";

const signinAdmin = () => signinUser({ email: "admin@autosouk.com", password: "Admin_@@789" });

// A mechanic who just sent a face video and both sides of the CIN, all
// waiting for an admin.
const mechanicWaiting = async () => {
  const { mechanic } = await createMechanic("mechanic@example.com");
  const userId = mechanic.userId as number;
  await db.update(usersTable).set({ identityStatus: "pending", phoneVerifiedAt: new Date() }).where(eq(usersTable.id, userId));
  await db.delete(mechanicVerificationsTable).where(eq(mechanicVerificationsTable.userId, userId));
  await db.insert(mechanicVerificationsTable).values({ userId, kind: "solo" });
  const [check] = await db
    .insert(identityVerificationsTable)
    .values({
      userId,
      status: "pending",
      challenges: ["turn_left", "smile", "look_up"],
      videoName: "face.webm",
      contentType: "video/webm",
      submittedAt: new Date(),
    })
    .returning();
  const documents = await db
    .insert(mechanicDocumentsTable)
    .values(
      (["cin_front", "cin_back"] as const).map((type) => ({
        userId,
        type,
        status: "pending" as const,
        fileName: `${type}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 1000,
        submittedAt: new Date(),
      })),
    )
    .returning();
  return { userId, mechanicId: mechanic.id as number, checkId: check.id, documents };
};

describe("verifications", () => {
  let admin: Awaited<ReturnType<typeof signinAdmin>>;

  beforeEach(async () => {
    admin = await signinAdmin();
  });

  const asAdmin = (method: "get" | "post", path: string) =>
    request(app)[method](path).auth(admin.accessToken, { type: "bearer" });

  it("lists everyone waiting, with what waits", async () => {
    const { userId } = await mechanicWaiting();
    const buyer = await createBuyer("buyer@example.com");
    await db.update(usersTable).set({ identityStatus: "pending" }).where(eq(usersTable.id, buyer.user.id));
    await db.insert(identityVerificationsTable).values({
      userId: buyer.user.id,
      status: "pending",
      challenges: ["blink"],
      videoName: "buyer.webm",
      contentType: "video/webm",
      submittedAt: new Date(Date.now() + 1000),
    });

    const { body } = await asAdmin("get", "/api/admin/verifications").expect(200);

    expect(body.verifications).toHaveLength(2);
    expect(body.verifications[0]).toMatchObject({
      user: { id: userId, role: "mechanic" },
      mechanic: { name: "Atlas Auto Care", kind: "solo" },
      waiting: { faceCheck: true, documents: 2 },
      resent: false,
    });
    expect(body.verifications[1]).toMatchObject({ user: { role: "buyer" }, waiting: { faceCheck: true, documents: 0 } });
    const overview = await asAdmin("get", "/api/admin/overview").expect(200);
    expect(overview.body.queues.verifications).toBe(2);
  });

  it("shows everything one user sent, and logs the video link", async () => {
    const { userId, checkId } = await mechanicWaiting();

    const { body } = await asAdmin("get", `/api/admin/verifications/${userId}`).expect(200);

    expect(body.user).toMatchObject({ id: userId, role: "mechanic", identityStatus: "pending" });
    expect(body.faceCheck).toMatchObject({ id: checkId, challenges: ["turn_left", "smile", "look_up"], videoUrl: expect.any(String) });
    expect(body.attempts).toEqual({ rejected: 0, max: 3 });
    expect(body.documents).toMatchObject({ kind: "solo", status: "pending", requiredTypes: ["cin_front", "cin_back"] });
    expect(body.documents.documents).toHaveLength(2);
    const logged = await db.select().from(auditLogTable).where(eq(auditLogTable.action, "identity.video_viewed"));
    expect(logged).toEqual([expect.objectContaining({ targetId: checkId })]);
  });

  it("approves the face video and the documents together, so buyers can book", async () => {
    const { userId, mechanicId, documents } = await mechanicWaiting();
    await request(app).get(`/api/mechanics/${mechanicId}`).expect(404);

    const partial = await asAdmin("post", `/api/admin/verifications/${userId}/decision`)
      .send({ documents: documents.map((doc) => ({ documentId: doc.id, decision: "approved", validUntil: "2031-03-14" })) })
      .expect(400);
    expect(partial.body.errors[0].code).toBe("admin.face_check_decision_required");

    const { body } = await asAdmin("post", `/api/admin/verifications/${userId}/decision`)
      .send({
        faceCheck: { decision: "approved" },
        documents: documents.map((doc) => ({ documentId: doc.id, decision: "approved", validUntil: "2031-03-14" })),
      })
      .expect(200);

    expect(body.user.identityStatus).toBe("approved");
    expect(body.faceCheck).toBeNull();
    expect(body.faceCheckHistory[0]).toMatchObject({ status: "approved" });
    expect(body.documents).toMatchObject({ status: "approved", bookable: true });
    await request(app).get(`/api/mechanics/${mechanicId}`).expect(200);
    expect(fileUtils.sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: "mechanic@example.com", subject: "You're verified on AutoSouk" }),
    );
  });

  it("keeps the mechanic hidden while the face video is rejected, and says why", async () => {
    const { userId, mechanicId, documents } = await mechanicWaiting();

    await asAdmin("post", `/api/admin/verifications/${userId}/decision`)
      .send({
        faceCheck: { decision: "rejected", reason: "Too dark" },
        documents: documents.map((doc) => ({ documentId: doc.id, decision: "approved", validUntil: "2031-03-14" })),
      })
      .expect(200);

    // Documents approved, face check not: still not bookable.
    await request(app).get(`/api/mechanics/${mechanicId}`).expect(404);
    const templates = (fileUtils.readTemplateFile as jest.Mock).mock.calls;
    expect(templates.at(-1)).toEqual([
      "verification_review.ejs",
      expect.objectContaining({
        key: "verification_rejected",
        items: [
          { label: "Face video", approved: false, reason: "Too dark" },
          { label: "CIN · front", approved: true, reason: null },
          { label: "CIN · back", approved: true, reason: null },
        ],
      }),
    ]);
    const again = await asAdmin("post", `/api/admin/verifications/${userId}/decision`)
      .send({ faceCheck: { decision: "approved" } })
      .expect(400);
    expect(again.body.errors[0].code).toBe("admin.nothing_to_review");
  });

  it("needs a reason to reject, and a decision on every document", async () => {
    const { userId, documents } = await mechanicWaiting();
    const decide = (body: object) => asAdmin("post", `/api/admin/verifications/${userId}/decision`).send(body);

    const noReason = await decide({ faceCheck: { decision: "rejected" } }).expect(400);
    expect(noReason.body.errors[0].code).toBe("identity.reason_required");
    const oneDocument = await decide({
      faceCheck: { decision: "approved" },
      documents: [{ documentId: documents[0]!.id, decision: "approved", validUntil: "2031-03-14" }],
    }).expect(400);
    expect(oneDocument.body.errors[0].code).toBe("mechanic_documents.decisions_incomplete");
    // Nothing was saved.
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    expect(user!.identityStatus).toBe("pending");
  });

  it("is for admins only", async () => {
    const buyer = await createBuyer("buyer@example.com");
    await request(app).get("/api/admin/verifications").auth(buyer.accessToken, { type: "bearer" }).expect(403);
  });
});

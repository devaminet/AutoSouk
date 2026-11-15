import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { auditLogTable } from "../../../db/schema/audit_log";
import { identityVerificationsTable } from "../../../db/schema/identity_verification";
import { usersTable } from "../../../db/schema/user";
import { minioClient } from "../../../file_storage/minio";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { identityBucketName } from "../../../utils/constants";
import * as fileUtils from "../../../utils/functions";

const adminCredentials = { email: "admin@autosouk.com", password: "Admin_@@789" };

beforeAll(async () => {
  await fileUtils.createBucket(identityBucketName);
});

let phones = 0;

// A signed-in buyer whose phone is verified, ready for the face check. Each
// gets their own number: a verified number belongs to one account.
const readyUser = async (email = "user@example.com") => {
  await signupUserWithVerification({ email });
  phones += 1;
  await db
    .update(usersTable)
    .set({ phoneVerifiedAt: new Date(), phone: `+2126000000${String(phones).padStart(2, "0")}` })
    .where(eq(usersTable.email, email));
  return signinUser({ email });
};

const start = (accessToken: string, contentType = "video/webm") =>
  request(app)
    .post("/api/identity/verifications")
    .send({ contentType })
    .auth(accessToken, { type: "bearer" });

const submit = (accessToken: string, id: number) =>
  request(app)
    .post(`/api/identity/verifications/${id}/submit`)
    .auth(accessToken, { type: "bearer" });

const uploadVideo = async (key: string, contentType = "video/webm") => {
  const video = Buffer.from("fake video bytes");
  await minioClient.putObject(identityBucketName, key, video, video.length, {
    "Content-Type": contentType,
  });
};

// Starts a check, uploads its video and sends it to review.
const pendingCheck = async (accessToken: string) => {
  const started = await start(accessToken).expect(201);
  await uploadVideo(started.body.upload.fields.key);
  await submit(accessToken, started.body.verification.id).expect(200);
  return started.body.verification.id as number;
};

const decide = (accessToken: string, id: number, body: object) =>
  request(app)
    .patch(`/api/identity/verifications/${id}`)
    .send(body)
    .auth(accessToken, { type: "bearer" });

const statusOf = async (email: string) => {
  const [user] = await db
    .select({ identityStatus: usersTable.identityStatus })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  return user.identityStatus;
};

it("needs the phone verified first", async () => {
  await signupUserWithVerification();
  const { accessToken } = await signinUser();
  const response = await start(accessToken).expect(400);
  expect(response.body.errors[0].code).toBe("identity.phone_not_verified");
});

it("gives random challenges and an upload policy", async () => {
  const { accessToken } = await readyUser();
  const response = await start(accessToken, "video/mp4").expect(201);

  const { challenges } = response.body.verification;
  expect(challenges).toHaveLength(4);
  expect(challenges[0]).toBe("look_straight");
  expect(new Set(challenges).size).toBe(4);
  expect(response.body.upload.url).toEqual(expect.any(String));
  expect(response.body.upload.fields.key).toMatch(/^identity-\d+-[\w-]+\.mp4$/);
  expect(response.body.attemptsLeft).toBe(3);
});

it("rejects an unknown video format", async () => {
  const { accessToken } = await readyUser();
  const response = await start(accessToken, "video/avi").expect(400);
  expect(response.body.errors[0].field).toBe("contentType");
});

it("sends the uploaded video to review", async () => {
  const { accessToken } = await readyUser();
  const started = await start(accessToken).expect(201);
  const { id } = started.body.verification;

  const missing = await submit(accessToken, id).expect(400);
  expect(missing.body.errors[0].code).toBe("identity.video_missing");

  await uploadVideo(started.body.upload.fields.key);
  const submitted = await submit(accessToken, id).expect(200);
  expect(submitted.body).toEqual({ identityStatus: "pending" });
  expect(await statusOf("user@example.com")).toBe("pending");

  const again = await start(accessToken).expect(400);
  expect(again.body.errors[0].code).toBe("identity.already_pending");
  const me = await request(app)
    .get("/api/identity/me")
    .auth(accessToken, { type: "bearer" })
    .expect(200);
  expect(me.body).toEqual({
    phoneVerified: true,
    identityStatus: "pending",
    attemptsLeft: 3,
    rejectionReason: null,
  });
});

it("refuses something that isn't a video", async () => {
  const { accessToken } = await readyUser();
  const started = await start(accessToken).expect(201);
  await uploadVideo(started.body.upload.fields.key, "text/plain");

  const response = await submit(accessToken, started.body.verification.id).expect(400);
  expect(response.body.errors[0].code).toBe("identity.video_invalid");
  const stat = await fileUtils.findObjectStat(identityBucketName, started.body.upload.fields.key);
  expect(stat).toBeNull();
});

it("refuses an expired session and another user's check", async () => {
  const { accessToken } = await readyUser();
  const started = await start(accessToken).expect(201);
  const { id } = started.body.verification;
  const other = await readyUser("other@example.com");
  const foreign = await submit(other.accessToken, id).expect(404);
  expect(foreign.body.errors[0].code).toBe("identity.not_found");

  await uploadVideo(started.body.upload.fields.key);
  await db
    .update(identityVerificationsTable)
    .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) });
  const expired = await submit(accessToken, id).expect(400);
  expect(expired.body.errors[0].code).toBe("identity.expired");
});

it("lets only admins list the checks, logging each video link", async () => {
  const { accessToken } = await readyUser();
  const id = await pendingCheck(accessToken);

  await request(app)
    .get("/api/identity/verifications")
    .auth(accessToken, { type: "bearer" })
    .expect(403);

  const admin = await signinUser(adminCredentials);
  const response = await request(app)
    .get("/api/identity/verifications")
    .auth(admin.accessToken, { type: "bearer" })
    .expect(200);
  expect(response.body.verifications).toHaveLength(1);
  expect(response.body.verifications[0]).toMatchObject({
    id,
    status: "pending",
    user: { email: "user@example.com", role: "buyer" },
    videoUrl: expect.stringContaining("identity-"),
  });
  const log = await db.select().from(auditLogTable);
  expect(log).toEqual([
    expect.objectContaining({ action: "identity.video_viewed", targetId: id }),
  ]);
});

it("rejects with a reason, deletes the video and emails the user", async () => {
  const { accessToken } = await readyUser();
  const id = await pendingCheck(accessToken);
  const [check] = await db.select().from(identityVerificationsTable);
  const admin = await signinUser(adminCredentials);

  const noReason = await decide(admin.accessToken, id, { decision: "rejected" }).expect(400);
  expect(noReason.body.errors[0].code).toBe("identity.reason_required");

  await decide(admin.accessToken, id, {
    decision: "rejected",
    reason: "Your face was hidden during step 3",
  }).expect(200);
  expect(await statusOf("user@example.com")).toBe("rejected");
  expect(await fileUtils.findObjectStat(identityBucketName, check.videoName)).toBeNull();
  expect(fileUtils.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({ to: "user@example.com", subject: expect.any(String) }),
  );

  const me = await request(app)
    .get("/api/identity/me")
    .auth(accessToken, { type: "bearer" })
    .expect(200);
  expect(me.body).toMatchObject({
    identityStatus: "rejected",
    attemptsLeft: 2,
    rejectionReason: "Your face was hidden during step 3",
  });

  const twice = await decide(admin.accessToken, id, { decision: "approved" }).expect(400);
  expect(twice.body.errors[0].code).toBe("identity.not_pending");
  const log = await db.select().from(auditLogTable);
  expect(log.map(({ action }) => action)).toContain("identity.rejected");
});

it("approves a check", async () => {
  const { accessToken } = await readyUser();
  const id = await pendingCheck(accessToken);
  const admin = await signinUser(adminCredentials);

  const response = await decide(admin.accessToken, id, { decision: "approved" }).expect(200);
  expect(response.body.verification).toMatchObject({ id, status: "approved", rejectionReason: null });
  expect(await statusOf("user@example.com")).toBe("approved");

  const login = await signinUser();
  expect(login.user).toMatchObject({ phoneVerified: true, identityStatus: "approved" });
  const again = await start(accessToken).expect(400);
  expect(again.body.errors[0].code).toBe("identity.already_approved");
});

it("stops after three rejected attempts", async () => {
  const { accessToken, user } = await readyUser();
  await db.insert(identityVerificationsTable).values(
    [1, 2, 3].map((n) => ({
      userId: user.id,
      status: "rejected" as const,
      challenges: ["look_straight"],
      videoName: `old-${n}.webm`,
      contentType: "video/webm",
    })),
  );
  await db.update(usersTable).set({ identityStatus: "rejected" }).where(eq(usersTable.id, user.id));

  const response = await start(accessToken).expect(403);
  expect(response.body.errors[0].code).toBe("identity.too_many_attempts");
});

it("returns 404 for an unknown check", async () => {
  const admin = await signinUser(adminCredentials);
  const response = await decide(admin.accessToken, 999999, { decision: "approved" }).expect(404);
  expect(response.body.errors[0].code).toBe("identity.not_found");
});

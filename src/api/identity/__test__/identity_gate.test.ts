import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { usersTable } from "../../../db/schema/user";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

// The setup lets every request through this gate; this file tests the real one.
jest.unmock("../../../middlewares/is_identity_verified");

const createListing = (accessToken: string) =>
  request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(accessToken, { type: "bearer" });

const setChecks = (values: { phoneVerifiedAt?: Date | null; identityStatus?: "pending" | "approved" }) =>
  db.update(usersTable).set(values).where(eq(usersTable.email, "user@example.com"));

it("blocks write actions until both checks pass", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const { accessToken } = await signinUser();

  const blocked = await createListing(accessToken).expect(403);
  expect(blocked.body.errors[0]).toMatchObject({
    code: "identity.required",
    message: "Verify your phone number and your identity to do this",
  });

  await setChecks({ phoneVerifiedAt: new Date(), identityStatus: "pending" });
  await createListing(accessToken).expect(403);

  await setChecks({ identityStatus: "approved" });
  await createListing(accessToken).expect(201);
});

it("needs the phone too, even when the face check passed", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const { accessToken } = await signinUser();
  await setChecks({ phoneVerifiedAt: null, identityStatus: "approved" });
  await createListing(accessToken).expect(403);
});

it("still answers a wrong role with the role error", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const { accessToken } = await signinUser();
  const response = await createListing(accessToken).expect(403);
  expect(response.body.errors[0].code).not.toBe("identity.required");
});

it("lets unverified users read", async () => {
  await signupUserWithVerification();
  const { accessToken } = await signinUser();
  await request(app).get("/api/listings").auth(accessToken, { type: "bearer" }).expect(200);
});

it("lets a mechanic send documents once the face video is sent", async () => {
  await signupUserWithVerification({ userType: "mechanic", mechanicDocumentsApproved: false });
  const { accessToken } = await signinUser();
  const chooseKind = () =>
    request(app).put("/api/mechanic-documents/me/kind").send({ kind: "solo" }).auth(accessToken, { type: "bearer" });

  const blocked = await chooseKind().expect(403);
  expect(blocked.body.errors[0].code).toBe("identity.face_check_required");

  await setChecks({ phoneVerifiedAt: new Date(), identityStatus: "pending" });
  await chooseKind().expect(200);
});

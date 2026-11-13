import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { phoneVerificationCodesTable } from "../../../db/schema/phone_verification_codes";
import { usersTable } from "../../../db/schema/user";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { sendSms } from "../../../utils/sms";
import { SmsDeliveryError, SmsRecipientError } from "../../../sms/errors";

const sendCode = (accessToken: string) =>
  request(app)
    .post("/api/auth/phone/code")
    .auth(accessToken, { type: "bearer" });

const verify = (accessToken: string, code: string) =>
  request(app)
    .post("/api/auth/phone/verify")
    .send({ code })
    .auth(accessToken, { type: "bearer" });

// The code in the last text sent.
const lastCode = () => {
  const calls = (sendSms as jest.Mock).mock.calls;
  return /\d{6}/.exec(calls[calls.length - 1][1])![0];
};

// Lets a new code be asked for at once, as if a minute had passed.
const ageCodes = async () => {
  await db
    .update(phoneVerificationCodesTable)
    .set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) });
};

const signIn = async (email = "user@example.com") => {
  await signupUserWithVerification({ email });
  return signinUser({ email });
};

it("needs a signed-in user", async () => {
  await request(app).post("/api/auth/phone/code").expect(401);
  await request(app).post("/api/auth/phone/verify").send({ code: "123456" }).expect(401);
});

it("texts a code and verifies the phone with it", async () => {
  const { accessToken, user } = await signIn();
  expect(user).toMatchObject({ phoneVerified: false, identityStatus: "not_submitted" });

  const sent = await sendCode(accessToken).expect(200);
  expect(sent.body).toMatchObject({ phone: "+212685412593" });
  expect(sendSms).toHaveBeenCalledWith(
    "+212685412593",
    expect.stringMatching(/AutoSouk: your code is \d{6}\. It expires in 10 minutes\./),
  );

  const verified = await verify(accessToken, lastCode()).expect(200);
  expect(verified.body.user).toMatchObject({ phoneVerified: true });
  const [row] = await db.select().from(phoneVerificationCodesTable);
  expect(row).toBeUndefined();

  const again = await sendCode(accessToken).expect(400);
  expect(again.body.errors[0].code).toBe("auth.phone_already_verified");
});

it("waits a minute between codes", async () => {
  const { accessToken } = await signIn();
  await sendCode(accessToken).expect(200);

  const response = await sendCode(accessToken).expect(429);
  expect(response.body.errors[0]).toMatchObject({ code: "auth.phone_code_wait" });
  expect(response.body.errors[0].params.seconds).toBeGreaterThan(0);
});

it("counts wrong tries and stops after the third", async () => {
  const { accessToken } = await signIn();
  await sendCode(accessToken).expect(200);
  const wrong = lastCode() === "000000" ? "111111" : "000000";

  const first = await verify(accessToken, wrong).expect(400);
  expect(first.body.errors[0]).toMatchObject({
    code: "auth.phone_code_invalid",
    message: "That code is wrong. Tries left: 2",
  });
  await verify(accessToken, wrong).expect(400);
  const third = await verify(accessToken, wrong).expect(400);
  expect(third.body.errors[0].code).toBe("auth.phone_code_expired");

  // Even the right code no longer works.
  const right = await verify(accessToken, lastCode()).expect(400);
  expect(right.body.errors[0].code).toBe("auth.phone_code_expired");
});

it("refuses an expired code and a missing one", async () => {
  const { accessToken } = await signIn();
  const missing = await verify(accessToken, "123456").expect(400);
  expect(missing.body.errors[0].code).toBe("auth.phone_code_missing");

  await sendCode(accessToken).expect(200);
  await db
    .update(phoneVerificationCodesTable)
    .set({ expiresAt: new Date(Date.now() - 1000) });
  const expired = await verify(accessToken, lastCode()).expect(400);
  expect(expired.body.errors[0].code).toBe("auth.phone_code_expired");
});

it("rejects a code that isn't 6 digits", async () => {
  const { accessToken } = await signIn();
  const response = await verify(accessToken, "12ab").expect(400);
  expect(response.body.errors[0].field).toBe("code");
});

it("keeps one account per verified phone number", async () => {
  const first = await signIn("first@example.com");
  await sendCode(first.accessToken).expect(200);
  await verify(first.accessToken, lastCode()).expect(200);

  // The second account signed up with the same number.
  const second = await signIn("second@example.com");
  const response = await sendCode(second.accessToken).expect(400);
  expect(response.body.errors[0].code).toBe("auth.phone_in_use");
});

it("refuses a phone verified by another account meanwhile", async () => {
  const first = await signIn("first@example.com");
  const second = await signIn("second@example.com");
  await sendCode(first.accessToken).expect(200);
  const firstCode = lastCode();
  await sendCode(second.accessToken).expect(200);
  const secondCode = lastCode();

  await verify(first.accessToken, firstCode).expect(200);
  const response = await verify(second.accessToken, secondCode).expect(400);
  expect(response.body.errors[0].code).toBe("auth.phone_in_use");
  const [user] = await db
    .select({ phoneVerifiedAt: usersTable.phoneVerifiedAt })
    .from(usersTable)
    .where(eq(usersTable.email, "second@example.com"));
  expect(user.phoneVerifiedAt).toBeNull();
});

it("allows five codes an hour", async () => {
  const { accessToken } = await signIn();
  for (let i = 0; i < 5; i += 1) {
    await sendCode(accessToken).expect(200);
    await ageCodes();
  }
  const response = await sendCode(accessToken).expect(429);
  expect(response.body.errors[0].code).toBe("auth.phone_code_limit");
});

it("refuses a number AutoSouk can't text, and keeps no code", async () => {
  const { accessToken } = await signIn();
  (sendSms as jest.Mock).mockRejectedValueOnce(new SmsRecipientError("+33612345678"));

  const response = await sendCode(accessToken).expect(400);
  expect(response.body.errors[0].code).toBe("auth.phone_unsupported");
  expect(await db.select().from(phoneVerificationCodesTable)).toEqual([]);
});

it("answers 500 when no SMS provider delivers", async () => {
  const { accessToken } = await signIn();
  (sendSms as jest.Mock).mockRejectedValueOnce(new SmsDeliveryError([]));
  jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await sendCode(accessToken).expect(500);
  expect(response.body.errors[0].code).toBe("auth.sms_failed");
  // The failed code doesn't count against the one-a-minute limit.
  await sendCode(accessToken).expect(200);
});

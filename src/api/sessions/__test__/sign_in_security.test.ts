import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { twoFactorChallengesTable } from "../../../db/schema/two_factor_challenge";
import { usersTable } from "../../../db/schema/user";
import {
  signupUserWithVerification,
  testUserCredentials,
} from "../../../test/helpers";
import * as fileUtils from "../../../utils/functions";
import { sendSms } from "../../../utils/sms";

const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const deviceCookie = (cookies: string[] | undefined) =>
  cookies
    ?.find((cookie) => cookie.startsWith("autosouk_device="))
    ?.split(";")[0];

const login = (
  options: { device?: string; userAgent?: string; password?: string } = {},
) => {
  const call = request(app)
    .post("/api/auth/login")
    .set("User-Agent", options.userAgent ?? chrome)
    .send({
      email: testUserCredentials.email,
      password: options.password ?? testUserCredentials.password,
    });
  return options.device ? call.set("Cookie", options.device) : call;
};

const twoFactor = (challengeToken: string, code: string) =>
  request(app)
    .post("/api/auth/login/two-factor")
    .set("User-Agent", chrome)
    .send({ challengeToken, code });

// The code in the last text sent.
const lastCode = () => {
  const calls = (sendSms as jest.Mock).mock.calls;
  return /\d{6}/.exec(calls[calls.length - 1][1])![0];
};

const otherCode = (code: string) => (code === "000000" ? "111111" : "000000");

// The test user with a verified phone. Buyers turn two-step sign-in on;
// mechanics always have it.
const withTwoFactor = async (role: "buyer" | "mechanic" = "buyer") => {
  await signupUserWithVerification({ userType: role });
  await db
    .update(usersTable)
    .set({ phoneVerifiedAt: new Date(), twoFactorEnabled: role === "buyer" })
    .where(eq(usersTable.email, testUserCredentials.email));
};

// The session cookie and its signature, as the browser sends them back.
const sessionOf = (cookies: string[] | undefined) =>
  (cookies ?? [])
    .filter((cookie) => cookie.startsWith("session"))
    .map((cookie) => cookie.split(";")[0]);

const devicesOf = (accessToken: string, device: string) =>
  request(app)
    .get("/api/auth/devices")
    .set("Cookie", device)
    .auth(accessToken, { type: "bearer" });

describe("rate limits", () => {
  it("stops after 10 sign-in tries for one email", async () => {
    await signupUserWithVerification();
    for (let i = 0; i < 10; i += 1) {
      await login({ password: "Wrong_@@123456" }).expect(401);
    }

    const response = await login().expect(429);
    expect(response.body.errors[0]).toMatchObject({
      code: "auth.too_many_attempts",
      params: { minutes: 15 },
    });
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("limits password reset requests per email", async () => {
    await signupUserWithVerification();
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: testUserCredentials.email });
    }

    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: testUserCredentials.email })
      .expect(429);
    expect(response.body.errors[0].code).toBe("auth.too_many_attempts");
  });
});

describe("devices", () => {
  it("remembers the device and emails about a new one", async () => {
    await signupUserWithVerification();
    const sendMail = fileUtils.sendMail as jest.Mock;
    sendMail.mockClear();

    const first = await login().expect(200);
    const device = deviceCookie(first.get("Set-Cookie"))!;
    expect(
      first.get("Set-Cookie")?.find((c) => c.startsWith("autosouk_device=")),
    ).toMatch(/HttpOnly/i);
    // The first device of an account gets no email.
    expect(sendMail).not.toHaveBeenCalled();

    // The same browser again: no new device, no email.
    const again = await login({ device }).expect(200);
    expect(deviceCookie(again.get("Set-Cookie"))).toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();

    // Another phone: a new device, and an email.
    await login({ userAgent: iphone }).expect(200);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUserCredentials.email,
        subject: "New sign-in to your AutoSouk account",
      }),
    );

    // Signing in again replaced the browser's session, and its access token.
    await devicesOf(first.body.accessToken, device).expect(401);
    const devices = await devicesOf(again.body.accessToken, device).expect(200);
    expect(devices.body.devices).toEqual([
      expect.objectContaining({ label: "Safari on iOS", current: false }),
      expect.objectContaining({ label: "Chrome on Windows", current: true }),
    ]);
  });

  it("signs another device out, ending its session", async () => {
    await signupUserWithVerification();
    const mine = await login().expect(200);
    const myDevice = deviceCookie(mine.get("Set-Cookie"))!;
    const other = await login({ userAgent: iphone }).expect(200);
    // Its session works until the device is signed out. Refreshing rotates
    // the token, so the newest cookie is the one to try again.
    const refreshed = await request(app)
      .post("/api/auth/refresh-token")
      .set("Cookie", sessionOf(other.get("Set-Cookie")))
      .expect(200);
    const otherSession = sessionOf(refreshed.get("Set-Cookie"));

    const { body } = await devicesOf(mine.body.accessToken, myDevice);
    const phone = body.devices.find((d: { current: boolean }) => !d.current);
    const current = body.devices.find((d: { current: boolean }) => d.current);

    const self = await request(app)
      .delete(`/api/auth/devices/${current.id}`)
      .set("Cookie", myDevice)
      .auth(mine.body.accessToken, { type: "bearer" })
      .expect(400);
    expect(self.body.errors[0].code).toBe("auth.device_is_current");

    await request(app)
      .delete(`/api/auth/devices/${phone.id}`)
      .set("Cookie", myDevice)
      .auth(mine.body.accessToken, { type: "bearer" })
      .expect(204);
    await request(app)
      .post("/api/auth/refresh-token")
      .set("Cookie", otherSession)
      .expect(401);
    // Only that device was signed out: this one still refreshes.
    await request(app)
      .post("/api/auth/refresh-token")
      .set("Cookie", sessionOf(mine.get("Set-Cookie")))
      .expect(200);
  });

  it("ends the session on logout", async () => {
    await signupUserWithVerification();
    const signedIn = await login().expect(200);
    const session = sessionOf(signedIn.get("Set-Cookie"));

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", session)
      .expect(200);
    await request(app)
      .post("/api/auth/refresh-token")
      .set("Cookie", session)
      .expect(401);
  });
});

describe("two-step sign-in", () => {
  it("asks for a code on a new device, then remembers it", async () => {
    await withTwoFactor();
    const started = await login().expect(200);
    expect(started.body).toMatchObject({
      twoFactorRequired: true,
      phoneHint: "•• 93",
    });
    expect(started.body.accessToken).toBeUndefined();
    expect(sendSms).toHaveBeenCalledWith(
      "+212685412593",
      expect.stringContaining("your sign-in code"),
    );
    const { challengeToken } = started.body;

    const bad = await twoFactor(challengeToken, otherCode(lastCode())).expect(400);
    expect(bad.body.errors[0]).toMatchObject({
      code: "auth.phone_code_invalid",
      params: { count: 2 },
    });

    const done = await twoFactor(challengeToken, lastCode()).expect(200);
    expect(done.body.accessToken).toEqual(expect.any(String));
    expect(done.body.user).toMatchObject({ twoFactorEnabled: true });
    const device = deviceCookie(done.get("Set-Cookie"));

    // The challenge is used up.
    await twoFactor(challengeToken, lastCode()).expect(400);

    (sendSms as jest.Mock).mockClear();
    const remembered = await login({ device }).expect(200);
    expect(remembered.body.accessToken).toEqual(expect.any(String));
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("always applies to mechanics, who can't turn it off", async () => {
    await withTwoFactor("mechanic");
    const started = await login().expect(200);
    expect(started.body.twoFactorRequired).toBe(true);

    const done = await twoFactor(started.body.challengeToken, lastCode()).expect(200);
    expect(done.body.user).toMatchObject({
      twoFactorEnabled: true,
      twoFactorRequired: true,
    });

    const off = await request(app)
      .patch("/api/auth/two-factor")
      .send({ enabled: false })
      .auth(done.body.accessToken, { type: "bearer" })
      .expect(403);
    expect(off.body.errors[0].code).toBe("auth.two_factor_required");
  });

  it("needs a verified phone to turn it on", async () => {
    await signupUserWithVerification();
    const signedIn = await login().expect(200);
    const refused = await request(app)
      .patch("/api/auth/two-factor")
      .send({ enabled: true })
      .auth(signedIn.body.accessToken, { type: "bearer" })
      .expect(400);
    expect(refused.body.errors[0].code).toBe("identity.phone_not_verified");

    await db
      .update(usersTable)
      .set({ phoneVerifiedAt: new Date() })
      .where(eq(usersTable.email, testUserCredentials.email));
    const on = await request(app)
      .patch("/api/auth/two-factor")
      .send({ enabled: true })
      .auth(signedIn.body.accessToken, { type: "bearer" })
      .expect(200);
    expect(on.body.user.twoFactorEnabled).toBe(true);
  });

  it("resends a code once a minute, replacing the old one", async () => {
    await withTwoFactor();
    const started = await login().expect(200);
    const { challengeToken } = started.body;
    const firstCode = lastCode();

    const tooSoon = await request(app)
      .post("/api/auth/login/two-factor/resend")
      .send({ challengeToken })
      .expect(429);
    expect(tooSoon.body.errors[0].code).toBe("auth.phone_code_wait");

    await db
      .update(twoFactorChallengesTable)
      .set({ sentAt: new Date(Date.now() - 2 * 60 * 1000) });
    await request(app)
      .post("/api/auth/login/two-factor/resend")
      .send({ challengeToken })
      .expect(200);
    const secondCode = lastCode();
    if (firstCode !== secondCode) {
      await twoFactor(challengeToken, firstCode).expect(400);
    }
    await twoFactor(challengeToken, secondCode).expect(200);
  });

  it("refuses an expired sign-in", async () => {
    await withTwoFactor();
    const started = await login().expect(200);
    await db
      .update(twoFactorChallengesTable)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await twoFactor(started.body.challengeToken, lastCode()).expect(400);
    expect(response.body.errors[0].code).toBe("auth.two_factor_expired");
  });
});

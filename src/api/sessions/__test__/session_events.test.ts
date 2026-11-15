import http from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { refreshTokensTable } from "../../../db/schema/refresh_tokens";
import { closeRedis, connectRedis } from "../../../redis/client";
import {
  signupUserWithVerification,
  testUserCredentials,
} from "../../../test/helpers";
import { generateJWT, verifyJWT } from "../../../utils/functions";

const chrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// The cookies a browser sends back: the session, its signature and the device.
const cookiesOf = (setCookie: string[] | undefined) =>
  (setCookie ?? [])
    .filter((cookie) => /^(session|autosouk_device)/.test(cookie))
    .map((cookie) => cookie.split(";")[0]);

const login = async (userAgent: string) => {
  const response = await request(app)
    .post("/api/auth/login")
    .set("User-Agent", userAgent)
    .send(testUserCredentials)
    .expect(200);
  return { accessToken: response.body.accessToken as string, cookies: cookiesOf(response.get("Set-Cookie")) };
};

let server: http.Server;

beforeAll((done) => {
  server = app.listen(0, done);
});

afterAll((done) => {
  server.close(done);
});

type Stream = {
  status: number;
  // Everything received until the server closed the stream.
  ended: Promise<string>;
  // Everything received so far.
  received: () => string;
  close: () => void;
};

// Opens the event stream like EventSource does, and resolves once the server
// answered and, for a 200, sent its first line.
const openStream = (cookies: string[]) =>
  new Promise<Stream>((resolve, reject) => {
    const { port } = server.address() as AddressInfo;
    const req = http.get(
      { port, path: "/api/auth/events", headers: { Cookie: cookies.join("; "), Accept: "text/event-stream" } },
      (res) => {
        let body = "";
        const ended = new Promise<string>((done) => res.on("end", () => done(body)));
        const stream = {
          status: res.statusCode ?? 0,
          ended,
          received: () => body,
          close: () => req.destroy(),
        };
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          const first = body === "";
          body += chunk;
          if (first) {
            resolve(stream);
          }
        });
        if (res.statusCode !== 200) {
          resolve(stream);
        }
      },
    );
    req.on("error", reject);
  });

// Waits until the condition holds, as stream events arrive on their own.
const waitFor = async (condition: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const revoked = "event: session.revoked\ndata: {}\n\n";

describe("GET /api/auth/events", () => {
  it("refuses a browser without a live session", async () => {
    const stream = await openStream([]);
    expect(stream.status).toBe(401);
    stream.close();
  });

  it("tells a device it was signed out from another one, and only that device", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const phone = await login(iphone);
    const phoneStream = await openStream(phone.cookies);
    const laptopStream = await openStream(laptop.cookies);
    expect(phoneStream.status).toBe(200);

    const { body } = await request(app)
      .get("/api/auth/devices")
      .set("Cookie", laptop.cookies)
      .auth(laptop.accessToken, { type: "bearer" });
    const phoneDevice = body.devices.find((d: { current: boolean }) => !d.current);
    await request(app)
      .delete(`/api/auth/devices/${phoneDevice.id}`)
      .set("Cookie", laptop.cookies)
      .auth(laptop.accessToken, { type: "bearer" })
      .expect(204);

    expect(await phoneStream.ended).toContain(revoked);
    expect(laptopStream.received()).not.toContain("session.revoked");
    laptopStream.close();

    // The signed-out device can't open a new stream.
    const again = await openStream(phone.cookies);
    expect(again.status).toBe(401);
    again.close();
  });

  it("tells the other tabs of a device that logged out", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const otherTab = await openStream(laptop.cookies);

    await request(app).post("/api/auth/logout").set("Cookie", laptop.cookies).expect(200);

    expect(await otherTab.ended).toContain(revoked);
  });

  it("drops a device that logged out from the list, and tells the other devices", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const phone = await login(iphone);
    const phoneStream = await openStream(phone.cookies);
    const listFromPhone = async () =>
      (
        await request(app)
          .get("/api/auth/devices")
          .set("Cookie", phone.cookies)
          .auth(phone.accessToken, { type: "bearer" })
          .expect(200)
      ).body.devices.map((device: { label: string }) => device.label);
    expect(await listFromPhone()).toEqual(["Safari on iOS", "Chrome on Windows"]);

    await request(app).post("/api/auth/logout").set("Cookie", laptop.cookies).expect(200);

    await waitFor(() => phoneStream.received().includes("event: devices.changed\n"));
    expect(await listFromPhone()).toEqual(["Safari on iOS"]);
    // Logging out of the laptop leaves the phone signed in.
    expect(phoneStream.received()).not.toContain("session.revoked");
    phoneStream.close();
  });

  it("tells every device when a reused refresh token ends all sessions", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const phone = await login(iphone);
    const laptopStream = await openStream(laptop.cookies);
    const phoneStream = await openStream(phone.cookies);

    // Refreshing rotates the token; sending the old one again looks like theft.
    const session = laptop.cookies.filter((cookie) => cookie.startsWith("session"));
    await request(app).post("/api/auth/refresh-token").set("Cookie", session).expect(200);
    await request(app).post("/api/auth/refresh-token").set("Cookie", session).expect(401);

    expect(await laptopStream.ended).toContain(revoked);
    expect(await phoneStream.ended).toContain(revoked);
  });
});

describe("session lifecycle", () => {
  const sessionCookies = (cookies: string[]) => cookies.filter((cookie) => cookie.startsWith("session"));
  const deviceCookie = (cookies: string[]) => cookies.filter((cookie) => cookie.startsWith("autosouk_device"));

  const listFrom = async (device: { accessToken: string; cookies: string[] }) =>
    (
      await request(app)
        .get("/api/auth/devices")
        .set("Cookie", device.cookies)
        .auth(device.accessToken, { type: "bearer" })
        .expect(200)
    ).body.devices.map((d: { label: string }) => d.label);

  it("keeps one session per device when the browser lost its cookie", async () => {
    await signupUserWithVerification();
    const phone = await login(iphone);
    const first = await login(chrome);
    // The browser closed and dropped the session cookie, but kept the device one.
    const again = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", chrome)
      .set("Cookie", deviceCookie(first.cookies))
      .send(testUserCredentials)
      .expect(200);
    const laptop = {
      accessToken: again.body.accessToken as string,
      cookies: [...sessionCookies(cookiesOf(again.get("Set-Cookie"))), ...deviceCookie(first.cookies)],
    };
    expect(await listFrom(phone)).toEqual(["Chrome on Windows", "Safari on iOS"]);

    await request(app).post("/api/auth/logout").set("Cookie", laptop.cookies).expect(200);

    expect(await listFrom(phone)).toEqual(["Safari on iOS"]);
  });

  it("doesn't list a device whose session expired", async () => {
    await signupUserWithVerification();
    const phone = await login(iphone);
    const laptop = await login(chrome);
    const [laptopToken] = sessionCookies(laptop.cookies);
    expect(laptopToken).toBeDefined();
    // The laptop's session is the newest row.
    const rows = await db.select().from(refreshTokensTable).orderBy(refreshTokensTable.id);
    await db
      .update(refreshTokensTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokensTable.id, rows[rows.length - 1].id));

    expect(await listFrom(phone)).toEqual(["Safari on iOS"]);
  });

  it("refuses a token sent after logout without ending the other devices", async () => {
    await signupUserWithVerification();
    const phone = await login(iphone);
    const laptop = await login(chrome);
    const phoneStream = await openStream(phone.cookies);

    // Another tab refreshed just before the logout, which carries the old token.
    const stale = sessionCookies(laptop.cookies);
    await request(app).post("/api/auth/refresh-token").set("Cookie", stale).expect(200);
    await request(app).post("/api/auth/logout").set("Cookie", stale).expect(200);
    // A request sent before the logout still carries that token.
    await request(app).post("/api/auth/refresh-token").set("Cookie", stale).expect(401);

    expect(await listFrom(phone)).toEqual(["Safari on iOS"]);
    expect(phoneStream.received()).not.toContain("session.revoked");
    phoneStream.close();
  });

  it("lets sign-in through when Redis is down", async () => {
    await signupUserWithVerification();
    await closeRedis();
    try {
      await login(chrome);
    } finally {
      await connectRedis();
    }
  });
});

describe("access tokens of ended sessions", () => {
  const devicesWith = (accessToken: string) =>
    request(app).get("/api/auth/devices").auth(accessToken, { type: "bearer" });

  it("refuses the access token of a session that logged out, and only that one", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const phone = await login(iphone);
    await devicesWith(laptop.accessToken).expect(200);

    await request(app).post("/api/auth/logout").set("Cookie", laptop.cookies).expect(200);

    await devicesWith(laptop.accessToken).expect(401);
    await devicesWith(phone.accessToken).expect(200);
  });

  it("refuses the access token of a device signed out from another one", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const phone = await login(iphone);
    const { body } = await devicesWith(laptop.accessToken).set("Cookie", laptop.cookies).expect(200);
    const phoneDevice = body.devices.find((d: { current: boolean }) => !d.current);

    await request(app)
      .delete(`/api/auth/devices/${phoneDevice.id}`)
      .set("Cookie", laptop.cookies)
      .auth(laptop.accessToken, { type: "bearer" })
      .expect(204);

    await devicesWith(phone.accessToken).expect(401);
    await devicesWith(laptop.accessToken).expect(200);
  });

  it("keeps the access tokens of a session working across refreshes", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const session = laptop.cookies.filter((cookie) => cookie.startsWith("session"));

    const refreshed = await request(app).post("/api/auth/refresh-token").set("Cookie", session).expect(200);

    await devicesWith(refreshed.body.accessToken).expect(200);
    await devicesWith(laptop.accessToken).expect(200);
  });

  it("refuses every access token once a reused refresh token ends all sessions", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const phone = await login(iphone);
    const session = laptop.cookies.filter((cookie) => cookie.startsWith("session"));
    await request(app).post("/api/auth/refresh-token").set("Cookie", session).expect(200);
    await request(app).post("/api/auth/refresh-token").set("Cookie", session).expect(401);

    await devicesWith(laptop.accessToken).expect(401);
    await devicesWith(phone.accessToken).expect(401);
  });

  it("refuses an access token that names no session", async () => {
    await signupUserWithVerification();
    const laptop = await login(chrome);
    const { id } = await verifyJWT<{ id: number }>(laptop.accessToken);
    const accessToken = await generateJWT(
      { id, email: testUserCredentials.email, issuedAt: Date.now(), role: "buyer" },
      Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS),
    );

    await devicesWith(accessToken!).expect(401);
  });
});

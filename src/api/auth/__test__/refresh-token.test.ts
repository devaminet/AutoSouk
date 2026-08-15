import request from "supertest";
import { app } from "../../../app";
import {
  extractRefreshTokenFromCookie,
  signinUser,
  signupUserWithVerification,
} from "../../../test/helpers";
import { generateJWT } from "../../../utils/functions";

it("should fail if the user is not logged in", async () => {
  return request(app).post("/api/auth/refresh-token").send().expect(400);
});

it("should return a new access token", async () => {
  await signupUserWithVerification();
  const { accessToken, refreshToken, cookies } = await signinUser();
  const response = await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", cookies!);
  const newRefreshToken = extractRefreshTokenFromCookie(
    response.get("Set-Cookie")?.[0]!
  );

  expect(response.body.accessToken).toBeDefined();
  expect(response.body.accessToken).not.toBe(accessToken);
  expect(newRefreshToken).not.toBe(refreshToken);
  expect(response.statusCode).toBe(200);
});

it("should return new tokens from multiple successive valid requests", async () => {
  await signupUserWithVerification();
  const { cookies } = await signinUser();
  const response = await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", cookies!);
  expect(response.statusCode).toBe(200);
  await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", response.get("Set-Cookie")!)
    .expect(200);
});

it("should fail if the same token was used", async () => {
  await signupUserWithVerification();
  const { cookies } = await signinUser();
  await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", cookies!)
    .expect(200);
  await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", cookies!)
    .expect(401);
});

it("should fail if invalid token was used", async () => {
  const refreshToken = await generateJWT(
    { id: 859, email: "random@example.com", issuedAt: new Date().getTime() },
    Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!)
  );
  const sessionObject = { refreshToken };
  const session = Buffer.from(JSON.stringify(sessionObject)).toString("base64");
  await signupUserWithVerification();
  await signinUser();
  await request(app)
    .post("/api/auth/refresh-token")
    .set("Cookie", [
      `session=${session}; path=/; samesite=none; httponly`,
      "session.sig=PCIX1kQSWzdcn2xifAW2veW5Q9o; path=/; samesite=none; httponly",
    ])
    .expect(400);
});

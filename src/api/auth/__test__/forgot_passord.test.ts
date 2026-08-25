import url from "url";
import request from "supertest";
import { app } from "../../../app";
import { readTemplateFile, sendMail } from "../../../utils/functions";
import { signupUserWithVerification } from "../../../test/helpers";

it("should validate request", async () => {
  return request(app).post("/api/auth/forgot-password").send({}).expect(400);
});

it("should validate email format", () => {
  return request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "example@user" })
    .expect(400);
});

it("should fail if email does not exist", async () => {
  await signupUserWithVerification();
  return request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "user-3@exmaple.com" })
    .expect(404);
});

it("should validate readTemplateFile function", async () => {
  const { formData } = await signupUserWithVerification();
  (readTemplateFile as jest.Mock).mockReset();

  await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: formData.email });

  const { firstName, forgotPasswordUrl, expiration } = (
    readTemplateFile as jest.Mock
  ).mock.calls[0][1];
  const parsedUrl = url.parse(forgotPasswordUrl, true, true);

  expect(readTemplateFile).toHaveBeenCalledTimes(1);
  expect(firstName).toBe(formData.firstName);
  expect(expiration).toBe("5 minutes");
  expect(`${parsedUrl.protocol}//${parsedUrl.host}`).toBe(
    process.env.BACKEND_URL
  );
  expect(parsedUrl.pathname).toBe("/api/auth/forgot-password");
  expect(parsedUrl.query.token).toBeDefined();
  expect(parsedUrl.query.email).toBe(formData.email);
});

it("should validate sendMail function", async () => {
  const { formData } = await signupUserWithVerification();
  (sendMail as jest.Mock).mockReset();

  const { statusCode } = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: formData.email });

  const { to, html } = (sendMail as jest.Mock).mock.calls[0][0];

  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(to).toBe(formData.email);
  expect(html).toBeDefined();
  expect(statusCode).toBe(200);
});

it("should fail if token is not present in the forgot password redirection link", async () => {
  const { statusCode, body } = await request(app)
    .get("/api/auth/forgot-password")
    .send();
  expect(statusCode).toBe(400);
  expect(body.errors[0].message).toBe("Token is required");
});

it("should fail if token is not correct in the forgot password redirection link", async () => {
  const { statusCode, body } = await request(app)
    .get("/api/auth/forgot-password?token=invalid_token")
    .send();
  expect(statusCode).toBe(400);
  expect(body.errors[0].message).toBe("Invalid token");
});

it("should redirect if request is valid", async () => {
  const { formData } = await signupUserWithVerification();
  (readTemplateFile as jest.Mock).mockReset();
  await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: formData.email });

  const { forgotPasswordUrl } = (readTemplateFile as jest.Mock).mock
    .calls[0][1];
  const parsedUrl = url.parse(forgotPasswordUrl, true, true);
  const token = parsedUrl.query.token;

  const { statusCode, headers } = await request(app)
    .get(`/api/auth/forgot-password?token=${token}&email=${formData.email}`)
    .send();
  expect(statusCode).toBe(301);
  expect(headers.location).toBe(
    `${process.env.CLIENT_URL}/reset-password?token=${token}`
  );
});

it("should fail if token is expired", async () => {
  const { formData } = await signupUserWithVerification();
  (readTemplateFile as jest.Mock).mockReset();
  await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: formData.email });

  const { forgotPasswordUrl } = (readTemplateFile as jest.Mock).mock
    .calls[0][1];
  const parsedUrl = url.parse(forgotPasswordUrl, true, true);
  const token = parsedUrl.query.token;

  jest.useFakeTimers({
    doNotFake: [
      "cancelAnimationFrame",
      "cancelIdleCallback",
      "clearImmediate",
      "clearInterval",
      "clearTimeout",
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "requestIdleCallback",
      "setImmediate",
      "setInterval",
      "setTimeout",
    ],
  });
  const advancedDate = new Date();
  advancedDate.setMinutes(advancedDate.getMinutes() + 5);
  jest.setSystemTime(advancedDate);

  const { statusCode, body } = await request(app)
    .get(`/api/auth/forgot-password?token=${token}&email=${formData.email}`)
    .send();
  expect(statusCode).toBe(400);
  expect(body.errors[0].message).toBe("Link has been expired");
  jest.useRealTimers();
});

it("should fail if the request body is not valid when updating the password", async () => {
  const { body, statusCode } = await request(app)
    .put("/api/auth/forgot-password")
    .send({});
  expect(statusCode).toBe(400);
  expect(body.errors).toHaveLength(2);
});

it("should fail if the new password is not valid", async () => {
  const { body, statusCode } = await request(app)
    .put("/api/auth/forgot-password")
    .send({ token: "a token", password: "weak_paa" });
  expect(statusCode).toBe(400);
  expect(body.errors).toHaveLength(1);
  expect(body.errors[0].field).toBe("password");
});

it("should fail if the token is invalid", async () => {
  const { body, statusCode } = await request(app)
    .put("/api/auth/forgot-password")
    .send({ token: "invalid token", password: "Pass@@852__" });
  expect(statusCode).toBe(400);
  expect(body.errors[0].message).toBe("Invalid token");
});

it("should update the password", async () => {
  const { formData } = await signupUserWithVerification();
  (readTemplateFile as jest.Mock).mockReset();
  await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: formData.email });

  const { forgotPasswordUrl } = (readTemplateFile as jest.Mock).mock
    .calls[0][1];
  const parsedUrl = url.parse(forgotPasswordUrl, true, true);
  const token = parsedUrl.query.token;

  return request(app)
    .put("/api/auth/forgot-password")
    .send({ token, password: "PIOScdcMkni_@sc568" })
    .expect(200);
});

import request from "supertest";
import url from "url";
import { app } from "../../../app";
import {
  signupUser,
  signupUserWithVerification,
  testUserCredentials,
} from "../../../test/helpers";
import { readTemplateFile, sendMail } from "../../../utils/functions";

it("should fail when not providing a token", () => {
  return request(app).get("/api/auth/verify").send().expect(400);
});

it("should fail when providing an invalid token", () => {
  return request(app)
    .get("/api/auth/verify?token=isenfcolkfcalo")
    .send()
    .expect(400);
});

it("should return 200 on success account verification", async () => {
  await signupUser();
  const { verificationUrl } = (readTemplateFile as jest.Mock).mock.calls[0][1];
  const token = url.parse(verificationUrl, true).query.token as string;
  expect(token).toBeDefined();

  return request(app).get(`/api/auth/verify?token=${token}`).send().expect(200);
});

it("should verify that isVerified field of user object is true after success verification", async () => {
  const { formData } = await signupUser();
  await request(app)
    .post("/api/auth/login")
    .send({ email: formData.email, password: formData.password })
    .expect(401);

  const { verificationUrl } = (readTemplateFile as jest.Mock).mock.calls[0][1];
  const token = url.parse(verificationUrl, true).query.token as string;
  await request(app).get(`/api/auth/verify?token=${token}`).send().expect(200);

  const { body } = await request(app)
    .post("/api/auth/login")
    .send({ email: formData.email, password: formData.password })
    .expect(200);
  expect(body.user.isVerified).toBe(true);
});

it("should validate user email when trying to re-verify the account", async () => {
  return request(app).post("/api/auth/re-verify").send({}).expect(400);
});

it("should validate user email format when trying to re-verify the account", async () => {
  return request(app)
    .post("/api/auth/re-verify")
    .send({ email: "user@example" })
    .expect(400);
});

it("should return 404 if user with the provided email was not found", async () => {
  return request(app)
    .post("/api/auth/re-verify")
    .send({ email: testUserCredentials.email })
    .expect(404);
});

it("should fail if the trying to verify an already verified user", async () => {
  const { formData } = await signupUserWithVerification();
  return request(app)
    .post("/api/auth/re-verify")
    .send({ email: formData.email })
    .expect(400);
});

it("should properly provide data to sendMail function on account re-verification", async () => {
  const { formData } = await signupUser();
  const verificationResponse = await request(app)
    .post("/api/auth/re-verify")
    .send({ email: formData.email });

  const mailCall = (sendMail as jest.Mock).mock.calls[0][0];

  // sendMail called twice, the first time inside signupUser and the second time in the re-verify handler
  expect(sendMail).toHaveBeenCalledTimes(2);
  expect(mailCall.to).toBe(formData.email);
  expect(mailCall.html).toBeDefined();
  expect(mailCall.subject).toBe("Verify Account");
  expect(verificationResponse.statusCode).toBe(200);
});

it("should properly provide data to register template on re-verify", async () => {
  const { formData } = await signupUser();
  const verificationResponse = await request(app)
    .post("/api/auth/re-verify")
    .send({ email: formData.email });

  // readTemplateFile called twice, the first time inside signupUser and the second time in the re-verify handler
  const templateOptions = (readTemplateFile as jest.Mock).mock.calls[1];
  const { verificationUrl, firstName, expiration } = templateOptions[1];
  const parsedUrl = url.parse(verificationUrl, true, true);

  expect(readTemplateFile).toHaveBeenCalledTimes(2);
  expect(templateOptions[0]).toBe("register.ejs");
  expect(firstName).toBe(formData.firstName);
  expect(expiration).toBe("5 minutes");
  expect(`${parsedUrl.protocol}//${parsedUrl.host}`).toBe(
    process.env.BACKEND_URL,
  );
  expect(parsedUrl.pathname).toBe("/api/auth/verify");
  expect(parsedUrl.query.token).toBeDefined();
  expect(verificationResponse.statusCode).toBe(200);
});

it("should fail when trying to verify with a token of different user", async () => {
  await signupUserWithVerification();
  await signupUser({ email: "user2@example.com" });

  const template1 = (readTemplateFile as jest.Mock).mock.calls[0][1];
  const token1 = url.parse(template1.verificationUrl, true).query
    .token as string;

  return request(app)
    .get(`/api/auth/verify?token=${token1}`)
    .send()
    .expect(400);
});

it("should fail when using the same token twice", async () => {
  await signupUser({ email: "user2@example.com" });

  const { verificationUrl } = (readTemplateFile as jest.Mock).mock.calls[0][1];
  const token = url.parse(verificationUrl, true).query.token as string;

  await request(app).get(`/api/auth/verify?token=${token}`).send().expect(200);

  return request(app).get(`/api/auth/verify?token=${token}`).send().expect(400);
});

it("should fail with expired verification token", async () => {
  await signupUser({ email: "user2@example.com" });
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
  const { verificationUrl } = (readTemplateFile as jest.Mock).mock.calls[0][1];
  const token = url.parse(verificationUrl, true).query.token as string;
  const { body, statusCode } = await request(app)
    .get(`/api/auth/verify?token=${token}`)
    .send();
  expect(statusCode).toBe(400);
  expect(body.errors[0].message).toBe("Link has been expired");
  jest.useRealTimers();
});

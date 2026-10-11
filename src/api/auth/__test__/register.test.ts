import url from "url";
import request from "supertest";
import { app } from "../../../app";
import { readTemplateFile, sendMail } from "../../../utils/functions";
import { signupUser, testUserCredentials } from "../../../test/helpers";
import { findUserByEmail } from "../db";

it("should persist the requested role on successful signup", async () => {
  const { formData, statusCode } = await signupUser();
  const registeredUser = await findUserByEmail(formData.email);

  expect(statusCode).toBe(201);
  expect(registeredUser?.role.name).toBe(formData.userType);
});

it("should fail when trying to signup with the same email", async () => {
  await signupUser();
  const { statusCode } = await signupUser();
  expect(statusCode).toBe(400);
});

it("should properly provide data to sendMail function on signup", async () => {
  const { formData, statusCode } = await signupUser();
  const mailCall = (sendMail as jest.Mock).mock.calls[0][0];

  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(mailCall.to).toBe(formData.email);
  expect(mailCall.html).toBeDefined();
  expect(mailCall.subject).toBe("Verify Account");
  expect(statusCode).toBe(201);
});

it("should properly provide data to register template on signup", async () => {
  const { formData, statusCode } = await signupUser();
  const templateOptions = (readTemplateFile as jest.Mock).mock.calls[0];
  const { verificationUrl, firstName, expiration } = templateOptions[1];
  const parsedUrl = url.parse(verificationUrl, true, true);

  expect(readTemplateFile).toHaveBeenCalledTimes(1);
  expect(templateOptions[0]).toBe("register.ejs");
  expect(firstName).toBe(formData.firstName);
  expect(expiration).toBe("5 minutes");
  expect(`${parsedUrl.protocol}//${parsedUrl.host}`).toBe(
    process.env.BACKEND_URL,
  );
  expect(parsedUrl.pathname).toBe("/api/auth/verify");
  expect(parsedUrl.query.token).toBeDefined();
  expect(statusCode).toBe(201);
});

it("should return 400 when not sending body", () => {
  return request(app).post("/api/auth/register").send().expect(400);
});

it("should return 400 when failing form validation", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({})
    .expect(400);
  expect(response.body.errors).toHaveLength(7);
});

it("should return 400 when inappropriate email was provided", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      firstName: "John",
      lastName: "Doe",
      email: "user@example",
      password: "USEr_@@852852",
      phone: "+212685412593",
      userType: "buyer",
      cityId: 1,
    })
    .expect(400);
  expect(response.body.errors).toHaveLength(1);
});

it("should return 400 when inappropriate password was provided", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      firstName: "John",
      lastName: "Doe",
      email: testUserCredentials.email,
      password: "USEr_@@",
      phone: "+212685412593",
      userType: "buyer",
      cityId: 1,
    })
    .expect(400);
  expect(response.body.errors).toHaveLength(1);
});

it("should fail when register with the same email", async () => {
  await signupUser();
  const { statusCode } = await signupUser();
  expect(statusCode).toBe(400);
});

it("should return 400 when profile image has an invalid file type", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      firstName: "John",
      lastName: "Doe",
      email: testUserCredentials.email,
      password: testUserCredentials.password,
      phone: "+212685412593",
      userType: "buyer",
      cityId: 1,
      imageName: "avatar.pdf",
    })
    .expect(400);
  expect(response.body.errors[0].field).toBe("imageName");
});

it("should store the profile image name and return an upload url", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      firstName: "John",
      lastName: "Doe",
      email: testUserCredentials.email,
      password: testUserCredentials.password,
      phone: "+212685412593",
      userType: "buyer",
      cityId: 1,
      imageName: "avatar.png",
    })
    .expect(201);
  expect(response.body.imageUpload.url).toContain("/users");
  expect(response.body.imageUpload.fields.key).toMatch(/^profile-/);
  expect(response.body.imageUpload.fields.policy).toBeDefined();

  const user = await findUserByEmail(testUserCredentials.email);
  expect(user?.imageName).toBeNull();
  expect(user?.pendingImageName).toMatch(/^profile-[a-f0-9]+\.png$/);
});

it("should not return an upload url when no profile image is sent", async () => {
  const { responseBody } = await signupUser();
  expect(responseBody.imageUpload).toBeUndefined();
  const user = await findUserByEmail(testUserCredentials.email);
  expect(user?.imageName).toBeNull();
});

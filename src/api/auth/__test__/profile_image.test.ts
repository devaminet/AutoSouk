import request from "supertest";
import { app } from "../../../app";
import { minioClient } from "../../../file_storage/minio";
import { usersBucketName } from "../../../utils/constants";
import { createBucket } from "../../../utils/functions";
import { findUserByEmail } from "../db";
import { signinUser, testUserCredentials } from "../../../test/helpers";
import { readTemplateFile } from "../../../utils/functions";
import url from "url";

const registerWithImage = async () => {
  const formData = {
    firstName: "John",
    lastName: "Doe",
    email: testUserCredentials.email,
    password: testUserCredentials.password,
    phone: "+212685412593",
    userType: "buyer",
    cityId: 1,
    imageName: "avatar.png",
  };
  const response = await request(app).post("/api/auth/register").send(formData);
  const mockCalls = (readTemplateFile as jest.Mock).mock.calls;
  const { verificationUrl } = mockCalls[mockCalls.length - 1][1];
  const token = url.parse(verificationUrl, true).query.token as string;
  await request(app).get(`/api/auth/verify?token=${token}`).expect(200);
  return response;
};

beforeAll(async () => {
  await createBucket(usersBucketName);
});

it("should require authentication to confirm a profile image", () => {
  return request(app).post("/api/auth/profile-image/confirm").expect(401);
});

it("should keep the default image on login when the upload never happened", async () => {
  await registerWithImage();
  const authUser = await signinUser();
  const user = await findUserByEmail(testUserCredentials.email);

  expect(user?.imageName).toBeNull();
  expect(user?.pendingImageName).not.toBeNull();
  expect(authUser.user.imageUrl).toContain("default-avatar.svg");
});

it("should fail to confirm when the file was not uploaded", async () => {
  await registerWithImage();
  const authUser = await signinUser();
  const response = await request(app)
    .post("/api/auth/profile-image/confirm")
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(400);
});

it("should issue a new upload policy for a retry", async () => {
  await registerWithImage();
  const authUser = await signinUser();
  const before = await findUserByEmail(testUserCredentials.email);

  const response = await request(app)
    .post("/api/auth/profile-image")
    .send({ imageName: "retry.jpg" })
    .auth(authUser.accessToken, { type: "bearer" });
  const after = await findUserByEmail(testUserCredentials.email);

  expect(response.statusCode).toBe(200);
  expect(response.body.imageUpload.fields.key).toMatch(/\.jpg$/);
  expect(after?.pendingImageName).not.toBe(before?.pendingImageName);
});

it("should reject an invalid retry image name", async () => {
  await registerWithImage();
  const authUser = await signinUser();
  const response = await request(app)
    .post("/api/auth/profile-image")
    .send({ imageName: "doc.pdf" })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(400);
});

it("should promote the pending image once uploaded", async () => {
  await registerWithImage();
  const authUser = await signinUser();
  const user = await findUserByEmail(testUserCredentials.email);
  const pending = user!.pendingImageName!;
  await minioClient.putObject(usersBucketName, pending, Buffer.from("img"), 3, {
    "Content-Type": "image/png",
  });

  const response = await request(app)
    .post("/api/auth/profile-image/confirm")
    .auth(authUser.accessToken, { type: "bearer" });
  const after = await findUserByEmail(testUserCredentials.email);

  expect(response.statusCode).toBe(200);
  expect(response.body.imageUrl).toContain(pending);
  expect(after?.imageName).toBe(pending);
  expect(after?.pendingImageName).toBeNull();
});

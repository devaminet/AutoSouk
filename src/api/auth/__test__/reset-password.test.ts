import request from "supertest";
import { app } from "../../../app";
import {
  signinUser,
  signupUserWithVerification,
  testUserCredentials,
} from "../../../test/helpers";

it("should fail is user is not authenticated", async () => {
  await request(app).put("/api/auth/reset-password").send({}).expect(401);
});

it("should fail request body is not provided", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();

  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({});
  expect(response.statusCode).toBe(400);
  expect(response.body.errors).toHaveLength(4);
});

it("should validate email format", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({
      password: "New_Pa55%%",
      confirmPassword: "New_Pa55%%",
      oldPassword: "OLd_Pa55%%",
      email: "user@example",
    });
  expect(response.statusCode).toBe(400);
  expect(response.body.errors).toHaveLength(1);
});

it("should validate password format", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({
      password: "new_pa55%%",
      confirmPassword: "new_pa55%%",
      oldPassword: "old_pa55%%",
      email: testUserCredentials.email,
    });
  expect(response.statusCode).toBe(400);
  expect(response.body.errors).toHaveLength(3);
});

it("should fail if password and confirm password are not the same", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({
      password: "New_pa55%%",
      confirmPassword: "New_pa55%%",
      oldPassword: "Old_pa55%%",
      email: testUserCredentials.email,
    });
  expect(response.statusCode).toBe(400);
});

it("should fail if email does not exist", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({
      password: "New_pa55%%",
      confirmPassword: "New_pa55%%",
      oldPassword: "Old_pa55%%",
      email: "user@example555.com",
    });
  expect(response.statusCode).toBe(400);
});

it("should fail if user provided invalid previous password", async () => {
  const { formData } = await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({
      password: "New_pa55%%",
      confirmPassword: "New_pa55%%",
      oldPassword: "Old_pa55%%",
      email: formData.email,
    });
  expect(response.statusCode).toBe(400);
});

it("should update user password", async () => {
  const { formData } = await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .put("/api/auth/reset-password")
    .auth(authUser.accessToken, { type: "bearer" })
    .send({
      password: "New_pa55%%",
      confirmPassword: "New_pa55%%",
      oldPassword: formData.password,
      email: formData.email,
    });
  expect(response.statusCode).toBe(200);
});

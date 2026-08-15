import request from "supertest";
import {
  signupUser,
  signupUserWithVerification,
  testUserCredentials,
} from "../../../test/helpers";
import { app } from "../../../app";

it("should return status code of 200 and response body on valid login", async () => {
  const { formData } = await signupUserWithVerification();
  const loginResponse = await request(app)
    .post("/api/auth/login")
    .send({
      email: formData.email,
      password: formData.password,
    })
    .expect(200);
  delete loginResponse.body.user.id;
  expect(loginResponse.body.user).toEqual({
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    city: formData.city,
    imageUrl: null,
    isVerified: true,
    phone: formData.phone,
    role: formData.userType,
  });
  expect(loginResponse.body.accessToken).toBeDefined();
  expect(loginResponse.get("Set-Cookie")?.[0]).toBeDefined();
});

it("should return status code of 404 when sign in with invalid credentials", async () => {
  await signupUser();
  await request(app)
    .post("/api/auth/login")
    .send({
      email: "user2@example.com",
      password: "Arand0M_p@SS",
    })
    .expect(401);
});

it("should return status code of 400 when not providing request body", async () => {
  await request(app).post("/api/auth/login").send().expect(400);
  const { statusCode, body } = await request(app)
    .post("/api/auth/login")
    .send({});
  expect(statusCode).toBe(400);
  expect(body.errors).toHaveLength(2);
});

it("should fail when sending invalid email", async () => {
  const { body, statusCode } = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@example", password: "User@@1010__" });
  expect(statusCode).toBe(400);
  expect(body.errors).toHaveLength(1);
  expect(body.errors[0].field).toBe("email");
});

it("should fail when sending invalid password", async () => {
  const { body, statusCode } = await request(app)
    .post("/api/auth/login")
    .send({ email: testUserCredentials.email, password: "User@" });
  expect(statusCode).toBe(400);
  expect(body.errors).toHaveLength(1);
  expect(body.errors[0].field).toBe("password");
});

import url from "url";
import request from "supertest";
import { app } from "../app";
import { readTemplateFile } from "../utils/functions";

export const testUserCredentials = {
  email: "user@example.com",
  password: "USEr_@@852852",
};

export const signupUser = async (options?: {
  userType?: "buyer" | "seller" | "mechanic" | "admin";
  email?: string;
}) => {
  const { email = testUserCredentials.email, userType = "buyer" } =
    options || {};
  const formData = {
    firstName: "John",
    lastName: "Doe",
    email,
    password: testUserCredentials.password,
    phone: "+212685412593",
    userType,
    city: "Tangier",
  };
  const response = await request(app).post("/api/auth/register").send(formData);

  return {
    formData,
    statusCode: response.statusCode,
    responseBody: response.body,
  };
};

export const signupUserWithVerification = async (options?: {
  userType?: "buyer" | "seller" | "mechanic" | "admin";
  email?: string;
}) => {
  const { email = testUserCredentials.email, userType = "buyer" } =
    options || {};
  const formData = {
    firstName: "John",
    lastName: "Doe",
    email,
    password: testUserCredentials.password,
    phone: "+212685412593",
    userType,
    city: "Tangier",
  };
  const response = await request(app).post("/api/auth/register").send(formData);
  const { verificationUrl } = (readTemplateFile as jest.Mock).mock.calls[0][1];
  const token = url.parse(verificationUrl, true).query.token as string;
  await request(app).get(`/api/auth/verify?token=${token}`).send().expect(200);

  return {
    formData,
    statusCode: response.statusCode,
    responseBody: response.body,
    response,
  };
};

export const extractRefreshTokenFromCookie = (cookie: string) => {
  const session = cookie?.split(";")[0].split("=")[1]!;
  const refreshToken = JSON.parse(atob(session)).refreshToken;
  return refreshToken;
};

export const signinUser = async (options?: {
  email: string;
  password: string;
}) => {
  const {
    email = testUserCredentials.email,
    password = testUserCredentials.password,
  } = options || {};
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password });

  const refreshToken = extractRefreshTokenFromCookie(
    response.get("Set-Cookie")?.[0]!,
  );

  return {
    user: response.body.user,
    accessToken: response.body.accessToken,
    refreshToken,
    cookies: response.get("Set-Cookie"),
  };
};

import url from "url";
import { z } from "zod";
import request from "supertest";
import { app } from "../app";
import { registrationRoleSchema } from "../api/auth/request_schema";
import { readTemplateFile } from "../utils/functions";
import { minCarImageCount } from "../utils/constants";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { carTable } from "../db/schema/car";
import { carMediaTable } from "../db/schema/car_media";

type TestUserRole = z.infer<typeof registrationRoleSchema>;

// Gives the listing's car uploaded images directly in the database, so tests
// that do not exercise uploads skip storage. The first new image is primary
// when the car has none.
export const addUploadedCarImages = async (
  listingId: number,
  count = minCarImageCount,
) => {
  const [car] = await db
    .select({ id: carTable.id })
    .from(carTable)
    .where(eq(carTable.listingId, listingId));
  const [primary] = await db
    .select({ id: carMediaTable.id })
    .from(carMediaTable)
    .where(
      and(eq(carMediaTable.carId, car.id), eq(carMediaTable.isPrimary, true)),
    );
  await db.insert(carMediaTable).values(
    Array.from({ length: count }, (_, index) => ({
      carId: car.id,
      link: `car-seeded-${listingId}-${index + 1}.png`,
      type: "image" as const,
      isPrimary: !primary && index === 0,
      isUploaded: true,
    })),
  );
};

// Completes a draft that has a car and sends it to review.
export const submitWithImages = async (
  listingId: number,
  accessToken: string,
) => {
  await addUploadedCarImages(listingId);
  await request(app)
    .post(`/api/listings/${listingId}/submit`)
    .auth(accessToken, { type: "bearer" })
    .expect(200);
};

export const testUserCredentials = {
  email: "user@example.com",
  password: "USEr_@@852852",
};

export const signupUser = async (options?: {
  userType?: TestUserRole;
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
    cityId: 1,
  };
  const response = await request(app).post("/api/auth/register").send(formData);

  return {
    formData,
    statusCode: response.statusCode,
    responseBody: response.body,
  };
};

// Opens a verification link: every outcome redirects to the client page, so
// callers must check the returned status.
export const verifyEmail = async (token?: string) => {
  const query = token ? `?token=${token}` : "";
  const response = await request(app)
    .get(`/api/auth/verify${query}`)
    .expect(302);
  const { origin, pathname, searchParams } = new URL(response.headers.location);
  return {
    origin,
    pathname,
    status: searchParams.get("status"),
    code: searchParams.get("code"),
    lang: searchParams.get("lang"),
  };
};

export const signupUserWithVerification = async (options?: {
  userType?: TestUserRole;
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
    cityId: 1,
  };
  const response = await request(app).post("/api/auth/register").send(formData);
  const mockCalls = (readTemplateFile as jest.Mock).mock.calls;
  const { verificationUrl } = mockCalls[mockCalls.length - 1][1];
  const token = url.parse(verificationUrl, true).query.token as string;
  const { status } = await verifyEmail(token);
  expect(status).toBe("success");

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
  password?: string;
}) => {
  const {
    email = options?.email || testUserCredentials.email,
    password = options?.password || testUserCredentials.password,
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

// Unapproved listings are hidden from the public, so tests that inspect them
// read the details as an admin.
export const getListingDetailsAsAdmin = async (listingId: number) => {
  const admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  return await request(app)
    .get(`/api/listings/${listingId}`)
    .auth(admin.accessToken, { type: "bearer" })
    .expect(200);
};

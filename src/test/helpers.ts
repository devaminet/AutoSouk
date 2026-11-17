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
import { cityTable } from "../db/schema/city";
import { carMediaTable } from "../db/schema/car_media";
import { mechanicVerificationsTable } from "../db/schema/mechanic_verification";
import { usersTable } from "../db/schema/user";

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

// Marks a mechanic's documents approved, so buyers can book them. Tests that
// aren't about the documents start from there.
export const approveMechanicDocuments = async (email: string) => {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  await db
    .insert(mechanicVerificationsTable)
    .values({ userId: user.id, kind: "garage", approvedAt: new Date() })
    .onConflictDoUpdate({
      target: mechanicVerificationsTable.userId,
      set: { approvedAt: new Date(), validUntil: null },
    });
};

export const signupUserWithVerification = async (options?: {
  userType?: TestUserRole;
  email?: string;
  // Mechanics start with approved documents unless this is false.
  mechanicDocumentsApproved?: boolean;
}) => {
  const {
    email = testUserCredentials.email,
    userType = "buyer",
    mechanicDocumentsApproved = true,
  } = options || {};
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
  if (userType === "mechanic" && mechanicDocumentsApproved) {
    await approveMechanicDocuments(email);
  }

  return {
    formData,
    statusCode: response.statusCode,
    responseBody: response.body,
    response,
  };
};

// The session cookie among a response's cookies.
export const sessionCookie = (cookies: string[] | undefined) =>
  cookies?.find((cookie) => cookie.startsWith("session="));

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
    sessionCookie(response.get("Set-Cookie"))!,
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

// The centre of a seeded city, where a workshop of that city may be placed.
export const cityCentre = async (cityId: number) => {
  const city = await db.query.cityTable.findFirst({
    where: eq(cityTable.id, cityId),
  });
  if (city?.latitude == null || city.longitude == null) {
    throw new Error(`City ${cityId} has no coordinates`);
  }
  return { latitude: city.latitude, longitude: city.longitude };
};

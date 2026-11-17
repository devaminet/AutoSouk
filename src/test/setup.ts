const readTemplateFileMock = jest.fn().mockResolvedValue("<html></html>");

import path from "path";
import "dotenv/config";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../db";
import { hashPassword } from "../utils/functions";
import { seeds } from "../db/seeds";
import { findRoleIdByName, insertUserWithRoleId } from "../api/auth/db";
import { resetRateLimits } from "../middlewares/rate_limit";
import { closeRedis, connectRedis } from "../redis/client";
import { closeSessionEvents } from "../api/sessions/events";

jest.mock("../utils/functions", () => {
  const originalModule = jest.requireActual("../utils/functions");
  return {
    __esModule: true,
    ...originalModule,
    sendMail: jest.fn(),
    readTemplateFile: readTemplateFileMock,
  };
});

// Texts never leave the tests; they read the codes from this mock.
jest.mock("../utils/sms", () => ({ __esModule: true, sendSms: jest.fn() }));

// Most tests aren't about the phone and face checks, so this gate lets them
// through. identity_gate.test.ts unmocks it to test the real thing.
jest.mock("../middlewares/is_identity_verified", () => ({
  __esModule: true,
  isIdentityVerified: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  hasSentFaceCheck: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

beforeAll(async () => {
  await connectRedis();
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await migrate(db, {
    migrationsFolder: path.join(path.resolve(), "/drizzle"),
  });
  await seeds();
});

beforeEach(async () => {
  try {
    const { hashedPassword, salt } = await hashPassword("Admin_@@789");
    const adminRoleId = await findRoleIdByName("admin");
    if (adminRoleId === null) {
      throw new Error("Admin role was not seeded");
    }

    await insertUserWithRoleId({
      email: "admin@autosouk.com",
      password: hashedPassword,
      salt,
      firstName: "autosouk",
      lastName: "admin",
      isVerified: true,
      cityId: 1,
      phone: "212600000000",
      roleId: adminRoleId,
    });
  } catch (error) {
    console.log("Error in test setup", error);
  }
});

afterEach(async () => {
  jest.resetAllMocks();
  await resetRateLimits();
  readTemplateFileMock.mockResolvedValue("<html></html>");

  await db.execute("DELETE FROM audit_log");
  await db.execute("DELETE FROM inspections");
  await db.execute("DELETE FROM cars");
  await db.execute("DELETE FROM listings");
  await db.execute("DELETE FROM email_verification_tokens");
  await db.execute("DELETE FROM forgot_password_tokens");
  await db.execute("DELETE FROM refresh_tokens");
  await db.execute("DELETE FROM favorite_listings");
  await db.execute("DELETE FROM users");
});

afterAll(async () => {
  await closeSessionEvents();
  await closeRedis();
  await pool.end();
});

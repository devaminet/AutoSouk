const readTemplateFileMock = jest.fn().mockResolvedValue("<html></html>");

import path from "path";
import "dotenv/config";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../db";
import { hashPassword } from "../utils/functions";
import { seeds } from "../db/seeds";
import { findRoleIdByName, insertUserWithRoleId } from "../api/auth/db";

jest.mock("../utils/functions", () => {
  const originalModule = jest.requireActual("../utils/functions");
  return {
    __esModule: true,
    ...originalModule,
    sendMail: jest.fn(),
    readTemplateFile: readTemplateFileMock,
  };
});

beforeAll(async () => {
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
  readTemplateFileMock.mockResolvedValue("<html></html>");

  await db.execute("DELETE FROM cars");
  await Promise.all([
    db.execute("DELETE FROM listings"),
    db.execute("DELETE FROM email_verification_tokens"),
    db.execute("DELETE FROM forgot_password_tokens"),
    db.execute("DELETE FROM refresh_tokens"),
    db.execute("DELETE FROM users"),
    db.execute("DELETE FROM favorite_listings"),
  ]);
});

afterAll(async () => {
  await pool.end();
});

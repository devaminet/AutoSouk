const readTemplateFileMock = jest.fn().mockResolvedValue("<html></html>");

import path from "path";
import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../db";
import { usersTable } from "../db/schema/user";
import { hashPassword } from "../utils/functions";

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
  await migrate(db, {
    migrationsFolder: path.join(path.resolve(), "/drizzle"),
  });
});

beforeEach(async () => {
  try {
    const { hashedPassword, salt } = await hashPassword("Admin_@@789");
    await db.insert(usersTable).values({
      email: "admin@autosouk.com",
      password: hashedPassword,
      salt,
      firstName: "autosouk",
      lastName: "admin",
      role: "admin",
      isVerified: true,
      city: "Rabat",
      phone: "212600000000",
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
  ]);
});

afterAll(async () => {
  await pool.end();
});

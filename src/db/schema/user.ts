import { relations } from "drizzle-orm";
import { boolean, date, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { emailVerificationTokensTable } from "./email_verification_tokens";
import { carTable } from "./car";
import { listingTable } from "./listing";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar().notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  salt: varchar({ length: 255 }).notNull(),
  phone: varchar({ length: 20 }).notNull(),
  role: varchar({
    enum: ["buyer", "seller", "mechanic", "admin"],
    length: 10,
  }).notNull(),
  city: varchar({ length: 100 }).notNull(),
  imageUrl: varchar("image_url"),
  isVerified: boolean("is_verified").default(false),
  createdAt: date("created_at").defaultNow().notNull(),
  updatedAt: date("updated_at").defaultNow().notNull(),
});

export const userRelations = relations(usersTable, ({ one, many }) => ({
  emailVerificationTokens: one(emailVerificationTokensTable),
  cars: many(carTable),
  listings: many(listingTable),
}));

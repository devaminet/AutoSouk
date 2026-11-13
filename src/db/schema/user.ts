import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { emailVerificationTokensTable } from "./email_verification_tokens";
import { carTable } from "./car";
import { listingTable } from "./listing";
import { cityTable } from "./city";
import { rolesTable } from "./roles";
import { mechanicTable } from "./mechanic";
import { defaultLocale, supportedLocales } from "../../utils/constants";

// Where the user is with the face check an admin reviews by hand.
export const identityStatusEnum = pgEnum("identity_status", [
  "not_submitted",
  "pending",
  "approved",
  "rejected",
]);

export const usersTable = pgTable(
  "users",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    email: varchar().notNull().unique(),
    password: varchar({ length: 255 }).notNull(),
    salt: varchar({ length: 255 }).notNull(),
    phone: varchar({ length: 20 }).notNull(),
    roleId: integer("role_id")
      .notNull()
      .references(() => rolesTable.id),
    cityId: integer("city_id").references(() => cityTable.id),
    imageName: varchar("image_name"),
    pendingImageName: varchar("pending_image_name"),
    isVerified: boolean("is_verified").default(false),
    // Set once the user typed the code texted to `phone`.
    phoneVerifiedAt: timestamp("phone_verified_at"),
    identityStatus: identityStatusEnum("identity_status")
      .notNull()
      .default("not_submitted"),
    // The language of the emails and documents sent to this user.
    locale: varchar({ enum: supportedLocales })
      .notNull()
      .default(defaultLocale),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("users_role_id_idx").on(table.roleId),
    // One account per verified phone number.
    uniqueIndex("users_verified_phone_unique")
      .on(table.phone)
      .where(sql`${table.phoneVerifiedAt} IS NOT NULL`),
  ],
);

export const userRelations = relations(usersTable, ({ one, many }) => ({
  emailVerificationTokens: one(emailVerificationTokensTable),
  cars: many(carTable),
  listings: many(listingTable),
  city: one(cityTable, {
    fields: [usersTable.cityId],
    references: [cityTable.id],
  }),
  role: one(rolesTable, {
    fields: [usersTable.roleId],
    references: [rolesTable.id],
  }),
  mechanic: one(mechanicTable, {
    fields: [usersTable.id],
    references: [mechanicTable.userId],
  }),
}));

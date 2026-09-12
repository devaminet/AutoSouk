import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";
import { emailVerificationTokensTable } from "./email_verification_tokens";
import { carTable } from "./car";
import { listingTable } from "./listing";
import { cityTable } from "./city";
import { rolesTable } from "./roles";

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
    imageUrl: varchar("image_url"),
    isVerified: boolean("is_verified").default(false),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [index("users_role_id_idx").on(table.roleId)],
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
}));

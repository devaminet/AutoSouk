import { date, integer, pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./user";
import { carTable } from "./car";

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "pending",
  "approved",
  "withdrawn",
  "rejected",
  "sold",
]);

export const listingTable = pgTable("listings", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  title: varchar().notNull(),
  description: varchar().notNull(),
  status: listingStatusEnum("status").default("draft"),
  approvedAt: date("approved_at"),
  createdAt: date("created_at").defaultNow().notNull(),
  updatedAt: date("updated_at").defaultNow().notNull(),
});

export const listingRelations = relations(listingTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [listingTable.userId],
    references: [usersTable.id],
  }),
  car: one(carTable),
}));

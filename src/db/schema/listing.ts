import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./user";
import { relations } from "drizzle-orm";

export const listingTable = pgTable("listings", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  title: varchar().notNull(),
  description: varchar().notNull(),
  status: varchar({
    enum: ["draft", "in_progress", "live"],
  }).notNull(),
});

export const listingRelations = relations(listingTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [listingTable.userId],
    references: [usersTable.id],
  }),
}));

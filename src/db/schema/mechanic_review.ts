import {
  check,
  date,
  index,
  integer,
  pgTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { usersTable } from "./user";
import { mechanicTable } from "./mechanic";

export const mechanicReviewTable = pgTable(
  "mechanic_reviews",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    mechanicId: integer("mechanic_id")
      .notNull()
      .references(() => mechanicTable.id, { onDelete: "cascade" }),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    message: varchar(),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mechanic_reviews_mechanic_id_idx").on(table.mechanicId),
    uniqueIndex("mechanic_reviews_one_per_buyer").on(
      table.mechanicId,
      table.buyerId,
    ),
    check(
      "mechanic_reviews_rating_range",
      sql`${table.rating} BETWEEN 1 AND 5`,
    ),
  ],
);

export type MechanicReview = typeof mechanicReviewTable.$inferSelect;
export type NewMechanicReview = typeof mechanicReviewTable.$inferInsert;

export const mechanicReviewRelations = relations(
  mechanicReviewTable,
  ({ one }) => ({
    mechanic: one(mechanicTable, {
      fields: [mechanicReviewTable.mechanicId],
      references: [mechanicTable.id],
    }),
    buyer: one(usersTable, {
      fields: [mechanicReviewTable.buyerId],
      references: [usersTable.id],
    }),
  }),
);

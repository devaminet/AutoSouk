import { relations } from "drizzle-orm";
import {
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";
import { listingTable } from "./listing";

export const favoriteListingsTable = pgTable(
  "favorite_listings",
  {
    buyerId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listingTable.id, { onDelete: "cascade" }),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.buyerId, table.listingId] })],
);

export const favoriteListingRelations = relations(
  favoriteListingsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [favoriteListingsTable.buyerId],
      references: [usersTable.id],
    }),
    listing: one(listingTable, {
      fields: [favoriteListingsTable.listingId],
      references: [listingTable.id],
    }),
  }),
);

export const userRelations = relations(usersTable, ({ many }) => {
  return {
    favorites: many(favoriteListingsTable),
  };
});

export const listingRelations = relations(listingTable, ({ many }) => {
  return {
    favorites: many(favoriteListingsTable),
  };
});

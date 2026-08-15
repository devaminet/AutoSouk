import { relations } from "drizzle-orm";
import { date, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { carModelTable } from "./car_model";
import { carTable } from "./car";

export const makeTable = pgTable("makes", {
  id: integer().primaryKey(),
  name: varchar().notNull(),
  createdAt: date("created_at").defaultNow().notNull(),
  updatedAt: date("updated_at").defaultNow().notNull(),
});

export const makeRelations = relations(makeTable, ({ many }) => ({
  models: many(carModelTable),
  cars: many(carTable),
}));

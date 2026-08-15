import { relations } from "drizzle-orm";
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { carTable } from "./car";

export const carStateTable = pgTable("car_states", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  state: varchar().notNull().unique(),
});

export const carStateRelations = relations(carStateTable, ({ many }) => ({
  cars: many(carTable),
}));

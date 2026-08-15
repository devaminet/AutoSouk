import { relations } from "drizzle-orm";
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { carTable } from "./car";

export const carCarburantTable = pgTable("carburants", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  carburant: varchar().notNull().unique(),
});

export const carburantRelations = relations(carCarburantTable, ({ many }) => ({
  cars: many(carTable),
}));

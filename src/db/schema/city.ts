import { relations } from "drizzle-orm";
import { varchar } from "drizzle-orm/pg-core";
import { integer } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./user";
import { carTable } from "./car";
import { mechanicTable } from "./mechanic";

export const cityTable = pgTable("cities", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull().unique(),
});

export const cityRelations = relations(cityTable, ({ many }) => ({
  users: many(usersTable),
  cars: many(carTable),
  mechanics: many(mechanicTable),
}));

import { relations } from "drizzle-orm";
import { doublePrecision, varchar } from "drizzle-orm/pg-core";
import { integer } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { usersTable } from "./user";
import { carTable } from "./car";
import { mechanicTable } from "./mechanic";

export const cityTable = pgTable("cities", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull().unique(),
  slug: varchar().notNull().unique(),
  // The city's centre and how far it reaches, so a workshop's pin can be
  // checked against its city. Null for a city without coordinates.
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  radiusKm: doublePrecision("radius_km"),
});

export const cityRelations = relations(cityTable, ({ many }) => ({
  users: many(usersTable),
  cars: many(carTable),
  mechanics: many(mechanicTable),
}));

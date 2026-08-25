import { integer, pgTable, varchar, boolean } from "drizzle-orm/pg-core";
import { carTable } from "./car";
import { relations } from "drizzle-orm";

export const carMediaTable = pgTable("car_media", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  carId: integer("car_id")
    .references(() => carTable.id, { onDelete: "cascade" })
    .notNull(),
  link: varchar().notNull(),
  type: varchar({
    enum: ["image", "video"],
  }).notNull(),
  isPrimary: boolean().notNull(),
});

export const carMediaRelations = relations(carMediaTable, ({ one }) => ({
  car: one(carTable, {
    fields: [carMediaTable.carId],
    references: [carTable.id],
  }),
}));

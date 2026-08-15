import {
  date,
  foreignKey,
  integer,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { makeTable } from "./car_make";
import { carTable } from "./car";

export const carModelTable = pgTable(
  "models",
  {
    id: integer().primaryKey(),
    makeId: integer("make_id")
      .references(() => makeTable.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar().notNull(),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "make_fk",
      columns: [table.makeId],
      foreignColumns: [makeTable.id],
    }).onDelete("cascade"),
  ]
);

export const carModelRelations = relations(carModelTable, ({ one, many }) => ({
  make: one(makeTable, {
    fields: [carModelTable.makeId],
    references: [makeTable.id],
  }),
  cars: many(carTable),
}));

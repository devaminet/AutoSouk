import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  varchar,
} from "drizzle-orm/pg-core";
import { carTable } from "./car";

export const equipmentCategoryTable = pgTable("equipment_categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar().notNull().unique(),
  name: varchar().notNull(),
  position: integer().notNull(),
});

export const equipmentTable = pgTable("equipment", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => equipmentCategoryTable.id),
  slug: varchar().notNull().unique(),
  name: varchar().notNull(),
  position: integer().notNull(),
});

export const carEquipmentTable = pgTable(
  "car_equipment",
  {
    carId: integer("car_id")
      .notNull()
      .references(() => carTable.id, { onDelete: "cascade" }),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => equipmentTable.id),
  },
  (table) => [
    primaryKey({ columns: [table.carId, table.equipmentId] }),
    index("car_equipment_equipment_id_idx").on(table.equipmentId),
  ],
);

export const equipmentCategoryRelations = relations(
  equipmentCategoryTable,
  ({ many }) => ({
    equipment: many(equipmentTable),
  }),
);

export const equipmentRelations = relations(
  equipmentTable,
  ({ one, many }) => ({
    category: one(equipmentCategoryTable, {
      fields: [equipmentTable.categoryId],
      references: [equipmentCategoryTable.id],
    }),
    cars: many(carEquipmentTable),
  }),
);

export const carEquipmentRelations = relations(
  carEquipmentTable,
  ({ one }) => ({
    car: one(carTable, {
      fields: [carEquipmentTable.carId],
      references: [carTable.id],
    }),
    equipment: one(equipmentTable, {
      fields: [carEquipmentTable.equipmentId],
      references: [equipmentTable.id],
    }),
  }),
);

import { date, index, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { mechanicTable } from "./mechanic";

export const mechanicGarageImageTable = pgTable(
  "mechanic_garage_images",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    mechanicId: integer("mechanic_id")
      .notNull()
      .references(() => mechanicTable.id, { onDelete: "cascade" }),
    link: varchar().notNull(),
    createdAt: date("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("mechanic_garage_images_mechanic_id_idx").on(table.mechanicId),
  ],
);

export type MechanicGarageImage = typeof mechanicGarageImageTable.$inferSelect;
export type NewMechanicGarageImage =
  typeof mechanicGarageImageTable.$inferInsert;

export const mechanicGarageImageRelations = relations(
  mechanicGarageImageTable,
  ({ one }) => ({
    mechanic: one(mechanicTable, {
      fields: [mechanicGarageImageTable.mechanicId],
      references: [mechanicTable.id],
    }),
  }),
);

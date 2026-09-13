import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { usersTable } from "./user";
import { cityTable } from "./city";
import { mechanicGarageImageTable } from "./mechanic_garage_image";

export const mechanicTable = pgTable(
  "mechanics",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: varchar().notNull(),
    cityId: integer("city_id")
      .notNull()
      .references(() => cityTable.id),
    address: varchar().notNull(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    description: varchar(),
    phone: varchar(),
    inspectionPrice: integer("inspection_price"),
    profileImageUrl: varchar("profile_image_url"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mechanics_city_id_idx").on(table.cityId),
    check(
      "mechanics_latitude_range",
      sql`${table.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      "mechanics_longitude_range",
      sql`${table.longitude} BETWEEN -180 AND 180`,
    ),
  ],
);

export type Mechanic = typeof mechanicTable.$inferSelect;
export type NewMechanic = typeof mechanicTable.$inferInsert;

export const mechanicRelations = relations(mechanicTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [mechanicTable.userId],
    references: [usersTable.id],
  }),
  city: one(cityTable, {
    fields: [mechanicTable.cityId],
    references: [cityTable.id],
  }),
  garageImages: many(mechanicGarageImageTable),
}));

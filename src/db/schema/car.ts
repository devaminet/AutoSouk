import { foreignKey, integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./user";
import { makeTable } from "./car_make";
import { carModelTable } from "./car_model";
import { carCarburantTable } from "./carburant";
import { carOriginTable } from "./car_origin";
import { carStateTable } from "./state";
import { listingTable } from "./listing";
import { carMediaTable } from "./car_media";

export const carTable = pgTable(
  "cars",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    makeId: integer("make_id").references(() => makeTable.id),
    modelId: integer("model_id").references(() => carModelTable.id),
    carburantId: integer("carburant_id").references(() => carCarburantTable.id),
    originId: integer("origin_id").references(() => carOriginTable.id),
    stateId: integer("state_id").references(() => carStateTable.id),
    listingId: integer("listing_id")
      .references(() => listingTable.id)
      .unique(),
    price: integer().notNull(),
    year: integer().notNull(),
    ownersCount: integer("owners_count").notNull(),
    city: varchar().notNull(),
    distance: varchar().notNull(),
    transmission: varchar({
      enum: ["manual", "automatic"],
    }).notNull(),
    fiscalPower: integer("fiscal_power").notNull(),
    doorsNumber: integer("doors_number").notNull(),
  },
  (table) => [
    foreignKey({
      name: "user_fk",
      columns: [table.userId],
      foreignColumns: [usersTable.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "make_fk",
      columns: [table.makeId],
      foreignColumns: [makeTable.id],
    }),
    foreignKey({
      name: "model_fk",
      columns: [table.modelId],
      foreignColumns: [carModelTable.id],
    }),
    foreignKey({
      name: "carburant_fk",
      columns: [table.carburantId],
      foreignColumns: [carCarburantTable.id],
    }),
    foreignKey({
      name: "origin_fk",
      columns: [table.originId],
      foreignColumns: [carOriginTable.id],
    }),
    foreignKey({
      name: "state_fk",
      columns: [table.stateId],
      foreignColumns: [carStateTable.id],
    }),
    foreignKey({
      name: "listing_fk",
      columns: [table.listingId],
      foreignColumns: [listingTable.id],
    }),
  ]
);

export const carRelations = relations(carTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [carTable.userId],
    references: [usersTable.id],
  }),
  make: one(makeTable, {
    fields: [carTable.makeId],
    references: [makeTable.id],
  }),
  model: one(carModelTable, {
    fields: [carTable.modelId],
    references: [carModelTable.id],
  }),
  carburant: one(carCarburantTable, {
    fields: [carTable.carburantId],
    references: [carCarburantTable.id],
  }),
  origin: one(carOriginTable, {
    fields: [carTable.originId],
    references: [carOriginTable.id],
  }),
  state: one(carStateTable, {
    fields: [carTable.stateId],
    references: [carStateTable.id],
  }),
  listing: one(listingTable, {
    fields: [carTable.listingId],
    references: [listingTable.id],
  }),
  carMedias: many(carMediaTable),
}));

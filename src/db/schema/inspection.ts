import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { usersTable } from "./user";
import { carTable } from "./car";
import { mechanicTable } from "./mechanic";

export const inspectionStatusEnum = pgEnum("inspection_status", [
  "pending",
  "accepted",
  "rejected",
  "in_progress",
  "completed",
  "cancelled",
]);

export const inspectionVerdictEnum = pgEnum("inspection_verdict", [
  "excellent",
  "good",
  "fair",
  "poor",
]);

export const mileageConsistencyEnum = pgEnum("mileage_consistency", [
  "consistent",
  "suspicious",
  "unverifiable",
]);

export const inspectionTable = pgTable(
  "inspections",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    carId: integer("car_id")
      .notNull()
      .references(() => carTable.id, { onDelete: "cascade" }),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mechanicId: integer("mechanic_id")
      .notNull()
      .references(() => mechanicTable.id, { onDelete: "restrict" }),
    status: inspectionStatusEnum("status").notNull().default("pending"),
    priceAtRequest: integer("price_at_request").notNull(),

    // Morocco-specific vehicle identity, verified by the mechanic on-site
    matricule: varchar("matricule"),
    vin: varchar("vin"),
    carteGriseNumber: varchar("carte_grise_number"),
    mileage: integer("mileage"),
    mileageConsistency: mileageConsistencyEnum("mileage_consistency"),
    mileageConsistencyNote: varchar("mileage_consistency_note"),
    firstRegistrationDate: date("first_registration_date"),
    controleTechniqueValid: boolean("controle_technique_valid"),
    controleTechniqueExpiry: date("controle_technique_expiry"),
    vignetteValid: boolean("vignette_valid"),
    inspectedAt: timestamp("inspected_at"),

    verdict: inspectionVerdictEnum("verdict"),
    overallScore: integer("overall_score"),
    summary: varchar("summary"),
    findings: jsonb("findings"),
    reportPdfLink: varchar("report_pdf_link"),

    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at"),
    completedAt: timestamp("completed_at"),
    createdAt: date("created_at").defaultNow().notNull(),
    updatedAt: date("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("inspections_car_id_idx").on(table.carId),
    index("inspections_mechanic_id_idx").on(table.mechanicId),
    index("inspections_buyer_id_idx").on(table.buyerId),
    index("inspections_status_idx").on(table.status),
    uniqueIndex("inspections_one_active_per_car")
      .on(table.carId)
      .where(sql`${table.status} IN ('pending','accepted','in_progress')`),
  ],
);

export type Inspection = typeof inspectionTable.$inferSelect;
export type NewInspection = typeof inspectionTable.$inferInsert;

export const inspectionRelations = relations(inspectionTable, ({ one }) => ({
  car: one(carTable, {
    fields: [inspectionTable.carId],
    references: [carTable.id],
  }),
  buyer: one(usersTable, {
    fields: [inspectionTable.buyerId],
    references: [usersTable.id],
  }),
  mechanic: one(mechanicTable, {
    fields: [inspectionTable.mechanicId],
    references: [mechanicTable.id],
  }),
}));

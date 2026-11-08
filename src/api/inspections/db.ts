import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../../db";
import { carTable } from "../../db/schema/car";
import { carMediaTable } from "../../db/schema/car_media";
import { mechanicTable } from "../../db/schema/mechanic";
import { inspectionTable } from "../../db/schema/inspection";
import { CompleteInspectionData } from "./services";

const activeStatuses = ["pending", "accepted", "in_progress"] as const;

export const findCarWithCityById = async (carId: number) => {
  const car = await db.query.carTable.findFirst({
    where: eq(carTable.id, carId),
    with: {
      city: true,
      listing: { columns: { status: true } },
    },
  });

  return car ?? null;
};

export const findMechanicById = async (mechanicId: number) => {
  const mechanic = await db.query.mechanicTable.findFirst({
    where: eq(mechanicTable.id, mechanicId),
  });

  return mechanic ?? null;
};

export const findMechanicByUserId = async (userId: number) => {
  const mechanic = await db.query.mechanicTable.findFirst({
    where: eq(mechanicTable.userId, userId),
  });

  return mechanic ?? null;
};

export const findActiveInspectionByCarId = async (carId: number) => {
  const inspection = await db.query.inspectionTable.findFirst({
    where: and(
      eq(inspectionTable.carId, carId),
      inArray(inspectionTable.status, [...activeStatuses]),
    ),
  });

  return inspection ?? null;
};

export const findInspectionById = async (id: number) => {
  const inspection = await db.query.inspectionTable.findFirst({
    where: eq(inspectionTable.id, id),
    with: {
      car: {
        with: {
          make: true,
          model: true,
          city: true,
          carburant: true,
          origin: true,
          listing: { columns: { id: true, title: true } },
          carMedias: {
            columns: { link: true },
            where: and(
              eq(carMediaTable.isUploaded, true),
              eq(carMediaTable.type, "image"),
            ),
            orderBy: [
              desc(carMediaTable.isPrimary),
              asc(carMediaTable.id),
            ] as SQL[],
            limit: 1,
          },
        },
      },
      buyer: true,
      mechanic: { with: { city: true } },
    },
  });

  return inspection ?? null;
};

// The car as the inspection lists show it: its name, first photo and seller.
const inspectionCar = {
  columns: { id: true, year: true },
  with: {
    make: { columns: { name: true } },
    model: { columns: { name: true } },
    listing: { columns: { id: true, title: true } },
    // The seller shows the car to the mechanic, so the mechanic calls them.
    user: { columns: { firstName: true, lastName: true, phone: true } },
    carMedias: {
      columns: { link: true },
      where: and(
        eq(carMediaTable.isUploaded, true),
        eq(carMediaTable.type, "image"),
      ),
      orderBy: [desc(carMediaTable.isPrimary), asc(carMediaTable.id)] as SQL[],
      limit: 1,
    },
  },
} as const;

// Newest requests first.
const newestFirst = [
  desc(inspectionTable.requestedAt),
  desc(inspectionTable.id),
] as SQL[];

export const findInspectionsByBuyer = async (buyerId: number) => {
  return await db.query.inspectionTable.findMany({
    where: eq(inspectionTable.buyerId, buyerId),
    with: {
      car: inspectionCar,
      mechanic: true,
    },
    orderBy: newestFirst,
  });
};

export const findInspectionsByMechanicId = async (mechanicId: number) => {
  return await db.query.inspectionTable.findMany({
    where: eq(inspectionTable.mechanicId, mechanicId),
    with: {
      car: inspectionCar,
      // Only what the mechanic needs to know who asked.
      buyer: { columns: { id: true, firstName: true, lastName: true } },
    },
    orderBy: newestFirst,
  });
};

export const insertInspection = async (data: {
  carId: number;
  buyerId: number;
  mechanicId: number;
  priceAtRequest: number;
}) => {
  const [inspection] = await db
    .insert(inspectionTable)
    .values(data)
    .returning();

  return inspection;
};

// The status each mechanic transition starts from.
const previousStatus = {
  accepted: "pending",
  rejected: "pending",
  in_progress: "accepted",
} as const;

export const updateInspectionStatusByMechanic = async (
  id: number,
  mechanicId: number,
  status: "accepted" | "rejected" | "in_progress",
) => {
  const [inspection] = await db
    .update(inspectionTable)
    .set({
      status,
      ...(status === "accepted" ? { acceptedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(inspectionTable.id, id),
        eq(inspectionTable.mechanicId, mechanicId),
        eq(inspectionTable.status, previousStatus[status]),
      ),
    )
    .returning();

  return inspection ?? null;
};

export const cancelInspectionByBuyer = async (id: number, buyerId: number) => {
  const [inspection] = await db
    .update(inspectionTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(inspectionTable.id, id),
        eq(inspectionTable.buyerId, buyerId),
        eq(inspectionTable.status, "pending"),
      ),
    )
    .returning();

  return inspection ?? null;
};

export const completeInspectionByMechanic = async (
  id: number,
  mechanicId: number,
  data: CompleteInspectionData,
  reportPdfLink: string,
) => {
  const { photoFilenames, ...findingsData } = data;

  const [inspection] = await db
    .update(inspectionTable)
    .set({
      status: "completed",
      matricule: data.matricule,
      vin: data.vin,
      carteGriseNumber: data.carteGriseNumber,
      mileage: data.mileage,
      mileageConsistency: data.mileageConsistency,
      mileageConsistencyNote: data.mileageConsistencyNote,
      firstRegistrationDate: data.firstRegistrationDate,
      controleTechniqueValid: data.controleTechniqueValid,
      controleTechniqueExpiry: data.controleTechniqueExpiry,
      vignetteValid: data.vignetteValid,
      inspectedAt: data.inspectedAt ? new Date(data.inspectedAt) : new Date(),
      verdict: data.verdict,
      overallScore: data.overallScore,
      summary: data.summary,
      findings: { sections: findingsData.sections, photoFilenames },
      reportPdfLink,
      reportDraft: null,
      reportDraftSavedAt: null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(inspectionTable.id, id),
        eq(inspectionTable.mechanicId, mechanicId),
        eq(inspectionTable.status, "in_progress"),
      ),
    )
    .returning();

  return inspection ?? null;
};

// Saves the mechanic's unfinished report. Only an inspection in progress
// takes a draft.
export const saveReportDraft = async (
  id: number,
  mechanicId: number,
  draft: unknown,
) => {
  const [inspection] = await db
    .update(inspectionTable)
    .set({ reportDraft: draft, reportDraftSavedAt: new Date() })
    .where(
      and(
        eq(inspectionTable.id, id),
        eq(inspectionTable.mechanicId, mechanicId),
        eq(inspectionTable.status, "in_progress"),
      ),
    )
    .returning({
      reportDraft: inspectionTable.reportDraft,
      reportDraftSavedAt: inspectionTable.reportDraftSavedAt,
    });

  return inspection ?? null;
};

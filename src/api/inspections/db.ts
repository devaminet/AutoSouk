import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { carTable } from "../../db/schema/car";
import { mechanicTable } from "../../db/schema/mechanic";
import { inspectionTable } from "../../db/schema/inspection";
import { CompleteInspectionData } from "./services";

const activeStatuses = ["pending", "accepted", "in_progress"] as const;

export const findCarWithCityById = async (carId: number) => {
  const car = await db.query.carTable.findFirst({
    where: eq(carTable.id, carId),
    with: {
      city: true,
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
        },
      },
      buyer: true,
      mechanic: { with: { city: true } },
    },
  });

  return inspection ?? null;
};

export const findInspectionsByBuyer = async (buyerId: number) => {
  return await db.query.inspectionTable.findMany({
    where: eq(inspectionTable.buyerId, buyerId),
    with: {
      car: { with: { make: true, model: true } },
      mechanic: true,
    },
  });
};

export const findInspectionsByMechanicId = async (mechanicId: number) => {
  return await db.query.inspectionTable.findMany({
    where: eq(inspectionTable.mechanicId, mechanicId),
    with: {
      car: { with: { make: true, model: true } },
      buyer: true,
    },
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

import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotAllowedError } from "../../errors/not_allowed";
import { NotFoundError } from "../../errors/not_found_error";
import { inspectionReportsBucketName } from "../../utils/constants";
import { generateGetPresignedUrl, sendMail } from "../../utils/functions";
import { minioClient } from "../../file_storage/minio";
import { generateInspectionReportPdf } from "./pdf";
import {
  cancelInspectionByBuyer,
  completeInspectionByMechanic,
  findActiveInspectionByCarId,
  findCarWithCityById,
  findInspectionById,
  findInspectionsByBuyer,
  findInspectionsByMechanicId,
  findMechanicById,
  findMechanicByUserId,
  insertInspection,
  updateInspectionStatusByMechanic,
} from "./db";
import {
  completeInspectionSchema,
  createInspectionSchema,
  updateInspectionStatusSchema,
} from "./request_schema";

type CreateInspectionData = z.infer<typeof createInspectionSchema>;
type UpdateInspectionStatusData = z.infer<typeof updateInspectionStatusSchema>;
export type CompleteInspectionData = z.infer<typeof completeInspectionSchema>;

export const requestInspection = async (
  buyerId: number,
  data: CreateInspectionData,
) => {
  const car = await findCarWithCityById(data.carId);
  if (!car) {
    throw new NotFoundError("Car was not found");
  }

  const mechanic = await findMechanicById(data.mechanicId);
  if (!mechanic || !mechanic.isActive) {
    throw new NotFoundError("Mechanic was not found");
  }

  if (mechanic.cityId !== car.cityId) {
    throw new BadRequestError(
      "Mechanic must be located in the same city as the car",
    );
  }

  const existingActive = await findActiveInspectionByCarId(data.carId);
  if (existingActive) {
    throw new BadRequestError(
      "This car already has an active inspection request",
    );
  }

  const inspection = await insertInspection({
    carId: data.carId,
    buyerId,
    mechanicId: data.mechanicId,
    priceAtRequest: mechanic.inspectionPrice ?? 0,
  });

  return { inspection };
};

export const getInspectionById = async (id: number, requesterUserId: number) => {
  const inspection = await findInspectionById(id);
  if (!inspection) {
    throw new NotFoundError("Inspection was not found");
  }

  const isBuyer = inspection.buyerId === requesterUserId;
  const isMechanic = inspection.mechanic.userId === requesterUserId;
  if (!isBuyer && !isMechanic) {
    throw new NotAllowedError();
  }

  if (inspection.reportPdfLink) {
    inspection.reportPdfLink = await generateGetPresignedUrl(
      inspectionReportsBucketName,
      inspection.reportPdfLink,
    );
  }

  return inspection;
};

export const getMyInspections = async (currentUser: {
  id: number;
  role: string;
}) => {
  if (currentUser.role === "buyer") {
    return await findInspectionsByBuyer(currentUser.id);
  }

  if (currentUser.role === "mechanic") {
    const mechanic = await findMechanicByUserId(currentUser.id);
    if (!mechanic) {
      throw new NotFoundError("Mechanic profile was not found");
    }
    return await findInspectionsByMechanicId(mechanic.id);
  }

  throw new NotAllowedError();
};

export const updateInspectionStatus = async (
  currentUser: { id: number; role: string },
  inspectionId: number,
  data: UpdateInspectionStatusData,
) => {
  if (data.status === "cancelled") {
    if (currentUser.role !== "buyer") {
      throw new NotAllowedError();
    }

    const inspection = await cancelInspectionByBuyer(
      inspectionId,
      currentUser.id,
    );
    if (!inspection) {
      throw new NotFoundError(
        "Inspection was not found or can no longer be cancelled",
      );
    }

    return { inspection };
  }

  if (currentUser.role !== "mechanic") {
    throw new NotAllowedError();
  }

  const mechanic = await findMechanicByUserId(currentUser.id);
  if (!mechanic) {
    throw new NotFoundError("Mechanic profile was not found");
  }

  const inspection = await updateInspectionStatusByMechanic(
    inspectionId,
    mechanic.id,
    data.status,
  );
  if (!inspection) {
    throw new NotFoundError("Inspection was not found");
  }

  return { inspection };
};

const buildReportReference = (inspectionId: number, issuedAt: Date) =>
  `AS-${issuedAt.getFullYear()}-${String(inspectionId).padStart(6, "0")}`;

const notifyBuyerOfCompletedInspection = async (
  buyerEmail: string,
  reportUrl: string,
) => {
  try {
    await sendMail({
      to: buyerEmail,
      subject: "Votre rapport d'inspection AutoSouk est pret",
      html: `<p>Bonjour,</p><p>Le rapport d'inspection du vehicule que vous suiviez est maintenant disponible.</p><p><a href="${reportUrl}">Consulter le rapport</a></p>`,
    });
  } catch (error) {
    console.error("Error sending inspection completion email:", error);
  }
};

export const submitInspectionReport = async (
  mechanicUserId: number,
  inspectionId: number,
  data: CompleteInspectionData,
) => {
  const mechanic = await findMechanicByUserId(mechanicUserId);
  if (!mechanic) {
    throw new NotFoundError("Mechanic profile was not found");
  }

  const inspection = await findInspectionById(inspectionId);
  if (!inspection || inspection.mechanicId !== mechanic.id) {
    throw new NotFoundError("Inspection was not found");
  }

  if (inspection.status !== "in_progress") {
    throw new BadRequestError(
      "Inspection must be in progress before it can be completed",
    );
  }

  const issuedAt = new Date();
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInspectionReportPdf({
      reference: buildReportReference(inspection.id, issuedAt),
      inspectedAt: data.inspectedAt ? new Date(data.inspectedAt) : issuedAt,
      issuedAt,
      vehicle: {
        make: inspection.car.make?.name ?? null,
        model: inspection.car.model?.name ?? null,
        year: inspection.car.year,
        matricule: data.matricule,
        vin: data.vin ?? null,
        carteGriseNumber: data.carteGriseNumber ?? null,
        mileageKm: data.mileage,
        mileageConsistency: data.mileageConsistency,
        mileageConsistencyNote: data.mileageConsistencyNote ?? null,
        firstRegistrationDate: data.firstRegistrationDate ?? null,
        fuel: inspection.car.carburant?.carburant ?? null,
        transmission: inspection.car.transmission,
        fiscalPower: inspection.car.fiscalPower,
        doorsNumber: inspection.car.doorsNumber,
        ownersCount: inspection.car.ownersCount,
        origin: inspection.car.origin?.origin ?? null,
        city: inspection.car.city?.name ?? null,
      },
      administrative: {
        controleTechniqueValid: data.controleTechniqueValid,
        controleTechniqueExpiry: data.controleTechniqueExpiry ?? null,
        vignetteValid: data.vignetteValid,
      },
      expert: {
        name: inspection.mechanic.name,
        address: inspection.mechanic.address,
        city: inspection.mechanic.city?.name ?? null,
        phone: inspection.mechanic.phone,
      },
      client: {
        name: `${inspection.buyer.firstName} ${inspection.buyer.lastName}`.trim(),
      },
      verdict: data.verdict,
      overallScore: data.overallScore,
      summary: data.summary,
      sections: data.sections,
      estimatedRepairCost: data.estimatedRepairCost,
    });
  } catch (error) {
    console.error("Error generating inspection report PDF:", error);
    throw new InternalServerError("Could not generate inspection report PDF");
  }

  const filename = `inspection-${inspection.id}-${Date.now()}.pdf`;
  try {
    await minioClient.putObject(
      inspectionReportsBucketName,
      filename,
      pdfBuffer,
      pdfBuffer.length,
      { "Content-Type": "application/pdf" },
    );
  } catch (error) {
    console.error("Error uploading inspection report PDF:", error);
    throw new InternalServerError("Could not store inspection report PDF");
  }

  const updated = await completeInspectionByMechanic(
    inspectionId,
    mechanic.id,
    data,
    filename,
  );
  if (!updated) {
    throw new InternalServerError("Could not complete inspection");
  }

  const reportUrl = await generateGetPresignedUrl(
    inspectionReportsBucketName,
    filename,
  );
  await notifyBuyerOfCompletedInspection(inspection.buyer.email, reportUrl);

  return { inspection: { ...updated, reportPdfLink: reportUrl } };
};

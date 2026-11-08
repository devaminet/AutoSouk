import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotAllowedError } from "../../errors/not_allowed";
import { NotFoundError } from "../../errors/not_found_error";
import {
  carBucketName,
  inspectionReportsBucketName,
} from "../../utils/constants";
import {
  generateGetPresignedUrl,
  generateGetPresignedUrls,
  readTemplateFile,
  sendMail,
} from "../../utils/functions";
import { Locale } from "../../i18n";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";
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
  // Buyers can only see, and so inspect, the cars of approved listings.
  const car = await findCarWithCityById(data.carId);
  if (!car || car.listing?.status !== "approved") {
    throw new NotFoundError("car.not_found");
  }

  const mechanic = await findMechanicById(data.mechanicId);
  if (!mechanic || !mechanic.isActive) {
    throw new NotFoundError("mechanic.not_found");
  }

  if (mechanic.cityId !== car.cityId) {
    throw new BadRequestError("inspection.mechanic_city_mismatch");
  }

  const existingActive = await findActiveInspectionByCarId(data.carId);
  if (existingActive) {
    throw new BadRequestError("inspection.already_active");
  }

  const inspection = await insertInspection({
    carId: data.carId,
    buyerId,
    mechanicId: data.mechanicId,
    priceAtRequest: mechanic.inspectionPrice ?? 0,
  });

  return { inspection };
};

export const getInspectionById = async (
  id: number,
  requesterUserId: number,
) => {
  const inspection = await findInspectionById(id);
  if (!inspection) {
    throw new NotFoundError("inspection.not_found");
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

  // Leave out the buyer's account details, such as their password hash.
  const { buyer, ...rest } = inspection;
  return {
    ...rest,
    buyer: { id: buyer.id, firstName: buyer.firstName, lastName: buyer.lastName },
  };
};

type ListedInspection = Awaited<
  ReturnType<typeof findInspectionsByMechanicId>
>[number];

type ListedCar = ListedInspection["car"];

// Presigns the cars' photos and the reports, and shapes each car as the
// lists show it.
const withLinks = async <T extends { car: ListedCar; reportPdfLink: string | null }>(
  inspections: T[],
) => {
  const photos = inspections.flatMap(({ car }) =>
    car.carMedias.map(({ link }) => link),
  );
  const reports = inspections.flatMap(({ reportPdfLink }) =>
    reportPdfLink ? [reportPdfLink] : [],
  );
  let photoUrls = new Map<string, string>();
  let reportUrls = new Map<string, string>();
  try {
    [photoUrls, reportUrls] = await Promise.all([
      generateGetPresignedUrls(carBucketName, photos),
      generateGetPresignedUrls(inspectionReportsBucketName, reports),
    ]);
  } catch (error) {
    console.error("Error generating inspection URLs:", error);
  }

  return inspections.map(({ car, reportPdfLink, ...inspection }) => {
    const { carMedias, user, listing, ...carDetails } = car;
    const photo = carMedias[0]?.link;
    return {
      ...inspection,
      reportPdfLink: reportPdfLink ? (reportUrls.get(reportPdfLink) ?? null) : null,
      car: {
        ...carDetails,
        listingId: listing?.id ?? null,
        title: listing?.title ?? null,
        photoUrl: photo ? (photoUrls.get(photo) ?? null) : null,
        seller: user,
      },
    };
  });
};

export const getMyInspections = async (currentUser: {
  id: number;
  role: string;
}) => {
  if (currentUser.role === "buyer") {
    return await withLinks(await findInspectionsByBuyer(currentUser.id));
  }

  if (currentUser.role === "mechanic") {
    const mechanic = await findMechanicByUserId(currentUser.id);
    if (!mechanic) {
      throw new NotFoundError("mechanic.profile_not_found");
    }
    return await withLinks(await findInspectionsByMechanicId(mechanic.id));
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
      throw new NotFoundError("inspection.not_cancellable");
    }

    return { inspection };
  }

  if (currentUser.role !== "mechanic") {
    throw new NotAllowedError();
  }

  const mechanic = await findMechanicByUserId(currentUser.id);
  if (!mechanic) {
    throw new NotFoundError("mechanic.profile_not_found");
  }

  const inspection = await updateInspectionStatusByMechanic(
    inspectionId,
    mechanic.id,
    data.status,
  );
  if (!inspection) {
    const existing = await findInspectionById(inspectionId);
    if (!existing || existing.mechanicId !== mechanic.id) {
      throw new NotFoundError("inspection.not_found");
    }
    // Accepting and rejecting answer a new request. Starting follows accepting.
    throw new BadRequestError("inspection.invalid_transition");
  }

  return { inspection };
};

const buildReportReference = (inspectionId: number, issuedAt: Date) =>
  `AS-${issuedAt.getFullYear()}-${String(inspectionId).padStart(6, "0")}`;

// Sent in the buyer's saved language, like the report itself.
const notifyBuyerOfCompletedInspection = async (
  buyer: { email: string; firstName: string; locale: Locale },
  reportUrl: string,
) => {
  try {
    const html = await readTemplateFile("inspection_report.ejs", {
      ...emailTemplateContext(buyer.locale),
      firstName: buyer.firstName,
      reportUrl,
    });
    await sendMail({
      to: buyer.email,
      subject: emailSubject(buyer.locale, "inspection_report.subject"),
      html,
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
    throw new NotFoundError("mechanic.profile_not_found");
  }

  const inspection = await findInspectionById(inspectionId);
  if (!inspection || inspection.mechanicId !== mechanic.id) {
    throw new NotFoundError("inspection.not_found");
  }

  if (inspection.status !== "in_progress") {
    throw new BadRequestError("inspection.not_in_progress");
  }

  const issuedAt = new Date();
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInspectionReportPdf(
      {
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
          city: inspection.car.city ?? null,
        },
        administrative: {
          controleTechniqueValid: data.controleTechniqueValid,
          controleTechniqueExpiry: data.controleTechniqueExpiry ?? null,
          vignetteValid: data.vignetteValid,
        },
        expert: {
          name: inspection.mechanic.name,
          address: inspection.mechanic.address,
          city: inspection.mechanic.city ?? null,
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
      },
      inspection.buyer.locale,
    );
  } catch (error) {
    console.error("Error generating inspection report PDF:", error);
    throw new InternalServerError("inspection.report_generation_failed");
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
    throw new InternalServerError("inspection.report_storage_failed");
  }

  const updated = await completeInspectionByMechanic(
    inspectionId,
    mechanic.id,
    data,
    filename,
  );
  if (!updated) {
    throw new InternalServerError("inspection.completion_failed");
  }

  const reportUrl = await generateGetPresignedUrl(
    inspectionReportsBucketName,
    filename,
  );
  await notifyBuyerOfCompletedInspection(inspection.buyer, reportUrl);

  return { inspection: { ...updated, reportPdfLink: reportUrl } };
};

import request from "supertest";
import { app } from "../../../app";
import * as fileUtils from "../../../utils/functions";
import { minioClient } from "../../../file_storage/minio";
import { createApprovedCar, createBuyer, createMechanic } from "./fixtures";

const requestInspection = async (
  buyerAccessToken: string,
  carId: number,
  mechanicId: number,
) => {
  const response = await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId })
    .auth(buyerAccessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  return response.body.inspection;
};

const moveToInProgress = async (mechanicAccessToken: string, id: number) => {
  await request(app)
    .patch(`/api/inspections/${id}`)
    .send({ status: "accepted" })
    .auth(mechanicAccessToken, { type: "bearer" })
    .expect(200);

  await request(app)
    .patch(`/api/inspections/${id}`)
    .send({ status: "in_progress" })
    .auth(mechanicAccessToken, { type: "bearer" })
    .expect(200);
};

const validReportPayload = {
  matricule: "12345-A-6",
  vin: "UU1HSDCEN61234567",
  carteGriseNumber: "CG-998877",
  mileage: 128450,
  mileageConsistency: "consistent",
  mileageConsistencyNote:
    "Kilométrage recoupé avec les calculateurs moteur et ABS et les visites techniques antérieures.",
  firstRegistrationDate: "2019-06-14",
  inspectedAt: "2026-09-15T10:30:00.000Z",
  controleTechniqueValid: true,
  controleTechniqueExpiry: "2027-01-01",
  vignetteValid: true,
  verdict: "good",
  overallScore: 82,
  summary: "Vehicule en bon etat general, quelques points a surveiller.",
  sections: [
    {
      category: "exterior",
      items: [
        { label: "Pare-chocs avant", status: "pass" },
        { label: "Pneu avant gauche", status: "attention", note: "4mm restants" },
      ],
    },
  ],
  estimatedRepairCost: 1200,
};

beforeEach(() => {
  jest
    .spyOn(fileUtils, "generateGetPresignedUrl")
    .mockResolvedValue("https://storage.test/report.pdf");
  jest.spyOn(minioClient, "putObject").mockResolvedValue({} as never);
});

it("should fail if the requester is not logged in", () => {
  return request(app)
    .post("/api/inspections/1/report")
    .send(validReportPayload)
    .expect(401);
});

it("should fail if the requester is not a mechanic", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send(validReportPayload)
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(403);
});

it("should reject a report missing required Morocco vehicle fields", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );
  await moveToInProgress(mechanicUser.accessToken, inspection.id);

  const { matricule, ...payloadWithoutMatricule } = validReportPayload;
  const { mileage, ...payloadWithoutMileage } = validReportPayload;

  await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send(payloadWithoutMatricule)
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(400);

  await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send(payloadWithoutMileage)
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(400);
});

it("should reject a malformed VIN", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );
  await moveToInProgress(mechanicUser.accessToken, inspection.id);

  await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send({ ...validReportPayload, vin: "UU1HSDCEN6123456O" })
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(400);
});

it("should refuse to complete an inspection that is not in progress", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send(validReportPayload)
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(400);
});

it("should generate the PDF report, store it in MinIO, and email the buyer", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );
  await moveToInProgress(mechanicUser.accessToken, inspection.id);

  const response = await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send(validReportPayload)
    .auth(mechanicUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection).toMatchObject({
    status: "completed",
    matricule: validReportPayload.matricule,
    vin: validReportPayload.vin,
    mileage: validReportPayload.mileage,
    mileageConsistency: validReportPayload.mileageConsistency,
    firstRegistrationDate: validReportPayload.firstRegistrationDate,
    verdict: validReportPayload.verdict,
    overallScore: validReportPayload.overallScore,
    reportPdfLink: "https://storage.test/report.pdf",
  });

  expect(minioClient.putObject).toHaveBeenCalledWith(
    "inspection-reports",
    expect.stringContaining(`inspection-${inspection.id}-`),
    expect.any(Buffer),
    expect.any(Number),
    expect.objectContaining({ "Content-Type": "application/pdf" }),
  );
  expect(fileUtils.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({ to: buyer.user.email }),
  );
});

it("should not let a mechanic complete another mechanic's inspection", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const { mechanicUser: otherMechanicUser } = await createMechanic(
    "other-mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );
  await moveToInProgress(mechanicUser.accessToken, inspection.id);

  await request(app)
    .post(`/api/inspections/${inspection.id}/report`)
    .send(validReportPayload)
    .auth(otherMechanicUser.accessToken, { type: "bearer" })
    .expect(404);
});

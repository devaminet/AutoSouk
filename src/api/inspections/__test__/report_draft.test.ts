import request from "supertest";
import { app } from "../../../app";
import { minioClient } from "../../../file_storage/minio";
import { createApprovedCar, createBuyer, createMechanic } from "./fixtures";

const draft = {
  matricule: "12345-A-6",
  mileage: 72410,
  mileageConsistency: "consistent",
  sections: [
    {
      category: "mechanical",
      items: [
        { label: "Engine oil and leaks", status: "pass", note: "Clean" },
        { label: "Brake pads and discs", status: null },
      ],
    },
  ],
};

const setUp = async () => {
  const { carId, listingId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const response = await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: mechanic.id })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(201);
  const id: number = response.body.inspection.id;
  const move = (status: string) =>
    request(app)
      .patch(`/api/inspections/${id}`)
      .send({ status })
      .auth(mechanicUser.accessToken, { type: "bearer" })
      .expect(200);
  const save = (body: object, token = mechanicUser.accessToken) =>
    request(app)
      .put(`/api/inspections/${id}/draft`)
      .send(body)
      .auth(token, { type: "bearer" });
  const read = (token: string) =>
    request(app)
      .get(`/api/inspections/${id}`)
      .auth(token, { type: "bearer" })
      .expect(200);
  return { id, listingId, mechanicUser, buyer, move, save, read };
};

it("should fail if the requester is not logged in", () => {
  return request(app).put("/api/inspections/1/draft").send(draft).expect(401);
});

it("should fail if the requester is not a mechanic", async () => {
  const { buyer, save } = await setUp();

  await save(draft, buyer.accessToken).expect(403);
});

it("should save the draft and give it back to the mechanic only", async () => {
  const { mechanicUser, buyer, move, save, read } = await setUp();
  await move("accepted");
  await move("in_progress");

  const response = await save(draft).expect(200);

  expect(response.body.reportDraft).toEqual(draft);
  expect(response.body.reportDraftSavedAt).toEqual(expect.any(String));
  const mechanicView = await read(mechanicUser.accessToken);
  expect(mechanicView.body.inspection.reportDraft).toEqual(draft);
  const buyerView = await read(buyer.accessToken);
  expect(buyerView.body.inspection).not.toHaveProperty("reportDraft");
  expect(buyerView.body.inspection).not.toHaveProperty("reportDraftSavedAt");
});

it("should replace the saved draft", async () => {
  const { mechanicUser, move, save, read } = await setUp();
  await move("accepted");
  await move("in_progress");
  await save(draft).expect(200);

  await save({ summary: "Second pass" }).expect(200);

  const view = await read(mechanicUser.accessToken);
  expect(view.body.inspection.reportDraft).toEqual({ summary: "Second pass" });
});

it("should only take a draft while the inspection is in progress", async () => {
  const { move, save } = await setUp();
  await move("accepted");

  const response = await save(draft);

  expect(response.statusCode).toBe(400);
  expect(response.body.errors[0].code).toBe("inspection.not_in_progress");
});

it("should not let another mechanic save a draft", async () => {
  const { move, save } = await setUp();
  await move("accepted");
  await move("in_progress");
  const { mechanicUser: other } = await createMechanic(
    "other-mechanic@example.com",
  );

  await save(draft, other.accessToken).expect(404);
});

it("should check the draft's values", async () => {
  const { move, save } = await setUp();
  await move("accepted");
  await move("in_progress");

  const response = await save({ overallScore: 101 });

  expect(response.statusCode).toBe(400);
  expect(response.body.errors[0].field).toBe("overallScore");
});

it("should give the car's photo with the inspection", async () => {
  const { listingId, mechanicUser, read } = await setUp();

  const view = await read(mechanicUser.accessToken);

  expect(view.body.inspection.car.photoUrl).toContain(
    `car-seeded-${listingId}-1.png`,
  );
  expect(view.body.inspection.car.carMedias).toBeUndefined();
});

it("should clear the draft once the report is submitted", async () => {
  jest.spyOn(minioClient, "putObject").mockResolvedValue({} as never);
  const { mechanicUser, move, save, read, id } = await setUp();
  await move("accepted");
  await move("in_progress");
  await save(draft).expect(200);

  await request(app)
    .post(`/api/inspections/${id}/report`)
    .send({
      matricule: "12345-A-6",
      mileage: 72410,
      mileageConsistency: "consistent",
      controleTechniqueValid: true,
      vignetteValid: true,
      verdict: "good",
      overallScore: 81,
      summary: "Good car.",
      sections: [
        {
          category: "mechanical",
          items: [{ label: "Engine oil and leaks", status: "pass" }],
        },
      ],
    })
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(200);

  const view = await read(mechanicUser.accessToken);
  expect(view.body.inspection.reportDraft).toBeNull();
  expect(view.body.inspection.reportDraftSavedAt).toBeNull();
});

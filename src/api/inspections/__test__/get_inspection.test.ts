import request from "supertest";
import { app } from "../../../app";
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

it("should fail if the requester is not logged in", () => {
  return request(app).get("/api/inspections/1").expect(401);
});

it("should return 404 for an unknown inspection", async () => {
  const buyer = await createBuyer("buyer@example.com");

  await request(app)
    .get("/api/inspections/999999")
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(404);
});

it("should let the requesting buyer view their inspection", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  const response = await request(app)
    .get(`/api/inspections/${inspection.id}`)
    .auth(buyer.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection.id).toBe(inspection.id);
});

it("should let the assigned mechanic view the inspection", async () => {
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

  const response = await request(app)
    .get(`/api/inspections/${inspection.id}`)
    .auth(mechanicUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection.id).toBe(inspection.id);
});

it("should not let an unrelated user view the inspection", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const unrelatedBuyer = await createBuyer("unrelated-buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  await request(app)
    .get(`/api/inspections/${inspection.id}`)
    .auth(unrelatedBuyer.accessToken, { type: "bearer" })
    .expect(403);
});

it("should list the buyer's own inspection requests", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  await requestInspection(buyer.accessToken, carId, mechanic.id);

  const response = await request(app)
    .get("/api/inspections")
    .auth(buyer.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspections).toHaveLength(1);
  expect(response.body.inspections[0].carId).toBe(carId);
});

it("should list the mechanic's inspection queue", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic, mechanicUser } = await createMechanic(
    "mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  await requestInspection(buyer.accessToken, carId, mechanic.id);

  const response = await request(app)
    .get("/api/inspections")
    .auth(mechanicUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspections).toHaveLength(1);
  expect(response.body.inspections[0].mechanicId).toBe(mechanic.id);
});

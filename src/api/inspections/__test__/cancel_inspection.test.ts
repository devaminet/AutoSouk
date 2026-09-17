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

it("should let the buyer cancel their own pending inspection", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  const response = await request(app)
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "cancelled" })
    .auth(buyer.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection.status).toBe("cancelled");
});

it("should not let another buyer cancel someone else's inspection", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const otherBuyer = await createBuyer("other-buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  await request(app)
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "cancelled" })
    .auth(otherBuyer.accessToken, { type: "bearer" })
    .expect(404);
});

it("should not let a buyer cancel an inspection that is no longer pending", async () => {
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
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "accepted" })
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(200);

  await request(app)
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "cancelled" })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(404);
});

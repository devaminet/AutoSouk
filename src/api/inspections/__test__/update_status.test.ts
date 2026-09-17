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

it("should fail if the user updating status is not logged in", () => {
  return request(app)
    .patch("/api/inspections/1")
    .send({ status: "accepted" })
    .expect(401);
});

it("should fail if the user is not a mechanic", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    mechanic.id,
  );

  await request(app)
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "accepted" })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(403);
});

it("should fail if the inspection does not belong to the mechanic", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic: ownerMechanic } = await createMechanic(
    "owner-mechanic@example.com",
  );
  const { mechanicUser: otherMechanicUser } = await createMechanic(
    "other-mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");
  const inspection = await requestInspection(
    buyer.accessToken,
    carId,
    ownerMechanic.id,
  );

  await request(app)
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "accepted" })
    .auth(otherMechanicUser.accessToken, { type: "bearer" })
    .expect(404);
});

it("should let the mechanic accept a pending inspection", async () => {
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
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "accepted" })
    .auth(mechanicUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection.status).toBe("accepted");
  expect(response.body.inspection.acceptedAt).not.toBeNull();
});

it("should let the mechanic reject a pending inspection", async () => {
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
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "rejected" })
    .auth(mechanicUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection.status).toBe("rejected");
});

it("should let the mechanic move an accepted inspection to in_progress", async () => {
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

  const response = await request(app)
    .patch(`/api/inspections/${inspection.id}`)
    .send({ status: "in_progress" })
    .auth(mechanicUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.inspection.status).toBe("in_progress");
});

it("should reject a mechanic trying to cancel an inspection", async () => {
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
    .send({ status: "cancelled" })
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(403);
});

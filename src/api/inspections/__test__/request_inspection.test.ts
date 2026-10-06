import request from "supertest";
import { app } from "../../../app";
import { createApprovedCar, createBuyer, createMechanic } from "./fixtures";

it("should fail if the user requesting an inspection is not logged in", () => {
  return request(app).post("/api/inspections").send({}).expect(401);
});

it("should fail if the requester is not a buyer", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  const sellerLikeUser = await createMechanic("other-mechanic@example.com");

  await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: mechanic.id })
    .auth(sellerLikeUser.mechanicUser.accessToken, { type: "bearer" })
    .expect(403);
});

it("should fail if the car does not exist", async () => {
  const { mechanic } = await createMechanic("mechanic@example.com");
  const buyer = await createBuyer("buyer@example.com");

  await request(app)
    .post("/api/inspections")
    .send({ carId: 999999, mechanicId: mechanic.id })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(404);
});

it("should fail if the mechanic does not exist or is inactive", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const buyer = await createBuyer("buyer@example.com");
  const { mechanic: inactiveMechanic } = await createMechanic(
    "inactive-mechanic@example.com",
    { isActive: false },
  );

  await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: 999999 })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(404);

  await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: inactiveMechanic.id })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(404);
});

it("should fail if the mechanic is not in the car's city", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com", {
    cityId: 2,
  });
  const buyer = await createBuyer("buyer@example.com");

  await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: mechanic.id })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(400);
});

it("should create an inspection request snapshotting the mechanic's price", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com", {
    inspectionPrice: 450,
  });
  const buyer = await createBuyer("buyer@example.com");

  const response = await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: mechanic.id })
    .auth(buyer.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  expect(response.body.inspection).toMatchObject({
    carId,
    mechanicId: mechanic.id,
    status: "pending",
    priceAtRequest: 450,
  });
});

it("should reject a second active inspection request for the same car", async () => {
  const { carId } = await createApprovedCar("seller@example.com");
  const { mechanic: firstMechanic } = await createMechanic(
    "first-mechanic@example.com",
  );
  const { mechanic: secondMechanic } = await createMechanic(
    "second-mechanic@example.com",
  );
  const buyer = await createBuyer("buyer@example.com");

  await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: firstMechanic.id })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(201);

  await request(app)
    .post("/api/inspections")
    .send({ carId, mechanicId: secondMechanic.id })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(400);
});

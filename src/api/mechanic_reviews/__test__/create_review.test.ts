import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

const validMechanicPayload = {
  name: "Atlas Auto Care",
  cityId: 1,
  address: "12 Rue Example",
  latitude: 33.5731,
  longitude: -7.5898,
};

const createMechanic = async () => {
  await signupUserWithVerification({
    userType: "mechanic",
    email: "mechanic@example.com",
  });
  const mechanicAuth = await signinUser({ email: "mechanic@example.com" });
  const response = await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(mechanicAuth.accessToken, { type: "bearer" });

  return response.body.mechanic;
};

const authAsBuyer = async (email = "buyer@example.com") => {
  await signupUserWithVerification({ userType: "buyer", email });
  return signinUser({ email });
};

it("should fail if the user is not logged in", async () => {
  const mechanic = await createMechanic();

  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 5 })
    .expect(401);
});

it("should fail if the user is not a buyer", async () => {
  const mechanic = await createMechanic();
  const mechanicAuth = await signinUser({ email: "mechanic@example.com" });

  const response = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 5 })
    .auth(mechanicAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(403);
});

it("should return 404 for a mechanic that does not exist", async () => {
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .post("/api/mechanics/999999/reviews")
    .send({ rating: 5 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(404);
});

it("should reject a rating outside the 1-5 range", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 6 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
});

it("should reject a review missing a rating", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ message: "Great job" })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
});

it("should reject a review message containing NSFW content", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 1, message: "putain de connard" })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
});

it("should create a review and return it", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 4, message: "Solid, honest inspection." })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  expect(response.body.review).toMatchObject({
    rating: 4,
    message: "Solid, honest inspection.",
  });
});

it("should reject a second review from the same buyer for the same mechanic", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 4 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  const secondResponse = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 2 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(secondResponse.statusCode).toBe(400);
});

it("should allow different buyers to review the same mechanic", async () => {
  const mechanic = await createMechanic();
  const firstBuyer = await authAsBuyer("buyer1@example.com");
  const secondBuyer = await authAsBuyer("buyer2@example.com");

  const firstResponse = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 5 })
    .auth(firstBuyer.accessToken, { type: "bearer" });
  const secondResponse = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 3 })
    .auth(secondBuyer.accessToken, { type: "bearer" });

  expect(firstResponse.statusCode).toBe(201);
  expect(secondResponse.statusCode).toBe(201);
});

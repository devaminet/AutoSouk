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
    .patch(`/api/mechanics/${mechanic.id}/reviews/me`)
    .send({ rating: 2 })
    .expect(401);
});

it("should return 404 when the buyer has no existing review for the mechanic", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .patch(`/api/mechanics/${mechanic.id}/reviews/me`)
    .send({ rating: 2 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(404);
});

it("should reject an update with an out-of-range rating", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 3 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  const response = await request(app)
    .patch(`/api/mechanics/${mechanic.id}/reviews/me`)
    .send({ rating: 0 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
});

it("should reject an update with NSFW content", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 3 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  const response = await request(app)
    .patch(`/api/mechanics/${mechanic.id}/reviews/me`)
    .send({ message: "قحبة" })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
});

it("should update the buyer's own review", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 3, message: "Okay service" })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  const response = await request(app)
    .patch(`/api/mechanics/${mechanic.id}/reviews/me`)
    .send({ rating: 5, message: "Actually, excellent after a follow-up" })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.review).toMatchObject({
    rating: 5,
    message: "Actually, excellent after a follow-up",
  });

  const listResponse = await request(app).get(
    `/api/mechanics/${mechanic.id}/reviews`,
  );
  expect(listResponse.body.reviews).toHaveLength(1);
  expect(listResponse.body.rating).toEqual({ average: 5, count: 1 });
});

it("should not let a buyer update another buyer's review", async () => {
  const mechanic = await createMechanic();
  const owner = await authAsBuyer("owner@example.com");
  const otherBuyer = await authAsBuyer("other@example.com");
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 3 })
    .auth(owner.accessToken, { type: "bearer" });

  const response = await request(app)
    .patch(`/api/mechanics/${mechanic.id}/reviews/me`)
    .send({ rating: 1 })
    .auth(otherBuyer.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(404);
});

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
    .delete(`/api/mechanics/${mechanic.id}/reviews/me`)
    .expect(401);
});

it("should return 404 when the buyer has no existing review for the mechanic", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();

  const response = await request(app)
    .delete(`/api/mechanics/${mechanic.id}/reviews/me`)
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(404);
});

it("should delete the buyer's own review and update the average rating", async () => {
  const mechanic = await createMechanic();
  const firstBuyer = await authAsBuyer("buyer1@example.com");
  const secondBuyer = await authAsBuyer("buyer2@example.com");
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 5 })
    .auth(firstBuyer.accessToken, { type: "bearer" });
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 1 })
    .auth(secondBuyer.accessToken, { type: "bearer" });

  const response = await request(app)
    .delete(`/api/mechanics/${mechanic.id}/reviews/me`)
    .auth(secondBuyer.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.deleted).toBe(true);

  const listResponse = await request(app).get(
    `/api/mechanics/${mechanic.id}/reviews`,
  );
  expect(listResponse.body.reviews).toHaveLength(1);
  expect(listResponse.body.rating).toEqual({ average: 5, count: 1 });
});

it("should allow the buyer to submit a new review after deleting the previous one", async () => {
  const mechanic = await createMechanic();
  const buyerAuth = await authAsBuyer();
  await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 2 })
    .auth(buyerAuth.accessToken, { type: "bearer" });
  await request(app)
    .delete(`/api/mechanics/${mechanic.id}/reviews/me`)
    .auth(buyerAuth.accessToken, { type: "bearer" });

  const response = await request(app)
    .post(`/api/mechanics/${mechanic.id}/reviews`)
    .send({ rating: 4 })
    .auth(buyerAuth.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  expect(response.body.review.rating).toBe(4);
});

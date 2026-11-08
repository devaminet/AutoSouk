import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

const validMechanicPayload = {
  name: "Atlas Auto Care",
  cityId: 1,
  address: "12 Rue Example",
  latitude: 30.4278,
  longitude: -9.5981,
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

const createReview = async (
  mechanicId: number,
  email: string,
  rating: number,
  message?: string,
) => {
  await signupUserWithVerification({ userType: "buyer", email });
  const buyerAuth = await signinUser({ email });

  return request(app)
    .post(`/api/mechanics/${mechanicId}/reviews`)
    .send({ rating, ...(message ? { message } : {}) })
    .auth(buyerAuth.accessToken, { type: "bearer" });
};

it("should return 404 for a mechanic that does not exist", async () => {
  await request(app).get("/api/mechanics/999999/reviews").expect(404);
});

it("should return an empty list and null average rating when there are no reviews", async () => {
  const mechanic = await createMechanic();

  const response = await request(app).get(
    `/api/mechanics/${mechanic.id}/reviews`,
  );

  expect(response.statusCode).toBe(200);
  expect(response.body.reviews).toEqual([]);
  expect(response.body.rating).toEqual({
    average: null,
    count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
});

it("should list reviews publicly and compute the average rating", async () => {
  const mechanic = await createMechanic();
  await createReview(mechanic.id, "buyer1@example.com", 5, "Excellent!");
  await createReview(mechanic.id, "buyer2@example.com", 3);

  const response = await request(app).get(
    `/api/mechanics/${mechanic.id}/reviews`,
  );

  expect(response.statusCode).toBe(200);
  expect(response.body.reviews).toHaveLength(2);
  expect(response.body.rating).toEqual({
    average: 4,
    count: 2,
    distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 },
  });
  expect(response.body.meta).toMatchObject({ total: 2, page: 1, limit: 10 });
  expect(response.body.reviews[0].buyer).toHaveProperty("name");
});

it("should paginate reviews", async () => {
  const mechanic = await createMechanic();
  await createReview(mechanic.id, "buyer1@example.com", 5);
  await createReview(mechanic.id, "buyer2@example.com", 4);
  await createReview(mechanic.id, "buyer3@example.com", 3);

  const response = await request(app)
    .get(`/api/mechanics/${mechanic.id}/reviews`)
    .query({ page: 1, limit: 2 });

  expect(response.statusCode).toBe(200);
  expect(response.body.reviews).toHaveLength(2);
  expect(response.body.meta).toMatchObject({
    total: 3,
    page: 1,
    limit: 2,
    totalPages: 2,
  });
});

it("should expose the average rating on the mechanic's public profile", async () => {
  const mechanic = await createMechanic();
  await createReview(mechanic.id, "buyer1@example.com", 4);
  await createReview(mechanic.id, "buyer2@example.com", 2);

  const response = await request(app).get(`/api/mechanics/${mechanic.id}`);

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanic.rating).toMatchObject({ average: 3, count: 2 });
});

describe("GET /api/mechanics/:mechanicId/reviews/me", () => {
  it("should return the buyer's own review", async () => {
    const mechanic = await createMechanic();
    await createReview(mechanic.id, "other@example.com", 2, "Late.");
    await createReview(mechanic.id, "mine@example.com", 5, "Thorough.");
    const buyerAuth = await signinUser({ email: "mine@example.com" });

    const response = await request(app)
      .get(`/api/mechanics/${mechanic.id}/reviews/me`)
      .auth(buyerAuth.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(200);
    expect(response.body.review).toMatchObject({
      rating: 5,
      message: "Thorough.",
    });
  });

  it("should return 404 when the buyer has no review", async () => {
    const mechanic = await createMechanic();
    await signupUserWithVerification({
      userType: "buyer",
      email: "none@example.com",
    });
    const buyerAuth = await signinUser({ email: "none@example.com" });

    await request(app)
      .get(`/api/mechanics/${mechanic.id}/reviews/me`)
      .auth(buyerAuth.accessToken, { type: "bearer" })
      .expect(404);
  });

  it("should require a buyer", async () => {
    const mechanic = await createMechanic();
    await request(app)
      .get(`/api/mechanics/${mechanic.id}/reviews/me`)
      .expect(401);
  });
});

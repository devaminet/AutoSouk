import request from "supertest";
import { app } from "../../../app";
import { updateMechanicActiveStatus } from "../../mechanics/db";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

const createMechanic = async (
  email: string,
  name: string,
  cityId: number,
) => {
  await signupUserWithVerification({ userType: "mechanic", email });
  const mechanicAuth = await signinUser({ email });
  const response = await request(app)
    .post("/api/mechanics")
    .send({
      name,
      cityId,
      address: "12 Rue Example",
      latitude: 33.5731,
      longitude: -7.5898,
    })
    .auth(mechanicAuth.accessToken, { type: "bearer" });

  return response.body.mechanic;
};

const review = async (mechanicId: number, email: string, rating: number) => {
  await signupUserWithVerification({ userType: "buyer", email });
  const buyerAuth = await signinUser({ email });

  return request(app)
    .post(`/api/mechanics/${mechanicId}/reviews`)
    .send({ rating })
    .auth(buyerAuth.accessToken, { type: "bearer" });
};

it("should require a cityId", async () => {
  await request(app).get("/api/mechanics/rankings").expect(400);
});

it("should rank mechanics in a city by average rating, best first", async () => {
  const topMechanic = await createMechanic(
    "top@example.com",
    "Top Garage",
    1,
  );
  const midMechanic = await createMechanic(
    "mid@example.com",
    "Mid Garage",
    1,
  );
  await review(topMechanic.id, "buyer1@example.com", 5);
  await review(topMechanic.id, "buyer2@example.com", 5);
  await review(midMechanic.id, "buyer3@example.com", 2);

  const response = await request(app)
    .get("/api/mechanics/rankings")
    .query({ cityId: 1 });

  expect(response.statusCode).toBe(200);
  const ids = response.body.rankings.map(
    (entry: { mechanicId: number }) => entry.mechanicId,
  );
  expect(ids.indexOf(topMechanic.id)).toBeLessThan(ids.indexOf(midMechanic.id));
  const top = response.body.rankings.find(
    (entry: { mechanicId: number }) => entry.mechanicId === topMechanic.id,
  );
  expect(top).toMatchObject({ averageRating: 5, reviewCount: 2 });
});

it("should not include mechanics from a different city", async () => {
  const mechanic = await createMechanic(
    "other-city@example.com",
    "Other City Garage",
    2,
  );
  await review(mechanic.id, "buyer4@example.com", 5);

  const response = await request(app)
    .get("/api/mechanics/rankings")
    .query({ cityId: 1 });

  const ids = response.body.rankings.map(
    (entry: { mechanicId: number }) => entry.mechanicId,
  );
  expect(ids).not.toContain(mechanic.id);
});

it("should not include inactive mechanics", async () => {
  const mechanic = await createMechanic(
    "inactive@example.com",
    "Inactive Garage",
    1,
  );
  await review(mechanic.id, "buyer5@example.com", 5);
  await updateMechanicActiveStatus(mechanic.id, false);

  const response = await request(app)
    .get("/api/mechanics/rankings")
    .query({ cityId: 1 });

  const ids = response.body.rankings.map(
    (entry: { mechanicId: number }) => entry.mechanicId,
  );
  expect(ids).not.toContain(mechanic.id);
});

it("should include active mechanics with no reviews, ranked after rated ones", async () => {
  const ratedMechanic = await createMechanic(
    "rated@example.com",
    "Rated Garage",
    1,
  );
  const unratedMechanic = await createMechanic(
    "unrated@example.com",
    "Unrated Garage",
    1,
  );
  await review(ratedMechanic.id, "buyer6@example.com", 4);

  const response = await request(app)
    .get("/api/mechanics/rankings")
    .query({ cityId: 1 });

  const ids = response.body.rankings.map(
    (entry: { mechanicId: number }) => entry.mechanicId,
  );
  expect(ids).toContain(unratedMechanic.id);
  expect(ids.indexOf(ratedMechanic.id)).toBeLessThan(
    ids.indexOf(unratedMechanic.id),
  );
});

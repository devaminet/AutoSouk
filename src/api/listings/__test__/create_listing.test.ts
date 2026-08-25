import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

it("should fail if the user who want to create a listing is not logged in", () => {
  return request(app).post("/api/listings").expect(401);
});

it("should fail if user is not of type buyer", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const response = await request(app)
    .post("/api/listings")
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(403);
});

it("should validate create listing request", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();
  const response = await request(app)
    .post("/api/listings")
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(400);
});

it("should create listing and return data", async () => {
  await signupUserWithVerification();
  const authUser = await signinUser();

  const title = "A black car for sale";
  const description =
    "A brand new Ford for sale with black wheel and black interior";

  const response = await request(app)
    .post("/api/listings")
    .send({
      title,
      description,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  expect(response.body.listing.userId).toBe(authUser.user.id);
  expect(response.body.listing.status).toBe("draft");
  expect(response.body.listing.title).toBe(title);
  expect(response.body.listing.description).toBe(description);
});

it("should fail when non admin tries to approve a listing", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();
  const response = await request(app)
    .patch("/api/listings/1/approve")
    .auth(authUser.accessToken, { type: "bearer" })
    .send();
  expect(response.statusCode).toBe(403);
});

it("should fail when listing does not exist", async () => {
  const authUser = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  const response = await request(app)
    .patch("/api/listings/1/approve")
    .auth(authUser.accessToken, { type: "bearer" })
    .send();
  expect(response.statusCode).toBe(404);
});

it("should return validation error when trying to attach car to listing with invalid data", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();

  const title = "A black car for sale";
  const description =
    "A brand new Ford for sale with black wheel and black interior";

  const response = await request(app)
    .post("/api/listings")
    .send({
      title,
      description,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  const listingId = response.body.listing.id;

  const attachCarResponse = await request(app)
    .post(`/api/listings/${listingId}/cars`)
    .send({})
    .auth(authUser.accessToken, { type: "bearer" });

  expect(attachCarResponse.statusCode).toBe(400);
  expect(attachCarResponse.body.errors).toHaveLength(14);
});

it("should attach car to a listing", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();

  const title = "A black car for sale";
  const description =
    "A brand new Ford for sale with black wheel and black interior";

  const response = await request(app)
    .post("/api/listings")
    .send({
      title,
      description,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  const listingId = response.body.listing.id;

  const attachCarResponse = await request(app)
    .post(`/api/listings/${listingId}/cars`)
    .send({
      makeId: 449,
      modelId: 2085,
      carburantId: 3,
      originId: 4,
      stateId: 6,
      price: 500000,
      year: 2025,
      ownersCount: 0,
      city: "Casablanca",
      distance: "60km",
      transmission: "automatic",
      fiscalPower: 8,
      doorsNumber: 5,
      filenames: ["pic_1.jpeg", "pic_2.jpeg", "pic_3.jpeg"],
    })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(attachCarResponse.statusCode).toBe(201);
});

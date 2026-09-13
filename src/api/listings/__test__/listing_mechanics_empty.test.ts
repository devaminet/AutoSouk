import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { readTemplateFile } from "../../../utils/functions";

const carPayload = {
  makeId: 449,
  modelId: 2085,
  carburantId: 3,
  originId: 4,
  stateId: 6,
  price: 500000,
  year: 2025,
  ownersCount: 0,
  cityId: 1,
  distance: "60km",
  transmission: "automatic",
  fiscalPower: 8,
  doorsNumber: 5,
  files: [{ name: "car.png", isPrimary: true, type: "image" }],
};

const createListing = async () => {
  (readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({ userType: "seller" });
  const seller = await signinUser();

  const response = await request(app)
    .post("/api/listings")
    .send({
      title: "A black car for sale",
      description: "A brand new Ford for sale",
    })
    .auth(seller.accessToken, { type: "bearer" });

  return response.body.listing.id as number;
};

const attachCar = async (listingId: number) => {
  const seller = await signinUser();

  await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);
};

const approveListing = async (listingId: number) => {
  const admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });

  await request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" })
    .expect(200);
};

const expectEmptyMechanics = (response: request.Response) => {
  expect(response.statusCode).toBe(200);
  expect(response.body.mechanics).toEqual([]);
  expect(response.body.meta).toMatchObject({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  });
};

it("should return an empty result when an approved listing's city has no active mechanics", async () => {
  const listingId = await createListing();
  await attachCar(listingId);
  await approveListing(listingId);

  const response = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );

  expectEmptyMechanics(response);
});

it("should return an empty result when an approved listing has no attached car or city", async () => {
  const listingId = await createListing();
  await approveListing(listingId);

  const response = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );

  expectEmptyMechanics(response);
});

it("should return an empty result when the listing is not approved", async () => {
  const listingId = await createListing();

  const response = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );

  expectEmptyMechanics(response);
});

import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import * as fileUtils from "../../../utils/functions";

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

const createMechanicProfile = async (accessToken: string) => {
  const response = await request(app)
    .post("/api/mechanics")
    .send({
      name: "Atlas Auto Care",
      cityId: 1,
      address: "12 Rue Example",
      latitude: 33.5731,
      longitude: -7.5898,
    })
    .auth(accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  return response.body.mechanic;
};

const createApprovedListing = async () => {
  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({
    userType: "seller",
    email: "seller@example.com",
  });
  const seller = await signinUser({ email: "seller@example.com" });
  const listingResponse = await request(app)
    .post("/api/listings")
    .send({
      title: "A black car for sale",
      description: "A brand new Ford for sale",
    })
    .auth(seller.accessToken, { type: "bearer" });
  const listingId = listingResponse.body.listing.id;

  await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);

  const admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  await request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" })
    .expect(200);

  return listingId;
};

it("should immediately apply mechanic status changes to public profile and discovery", async () => {
  jest
    .spyOn(fileUtils, "generateGetPresignedUrls")
    .mockResolvedValue(new Map());
  await signupUserWithVerification({ userType: "mechanic" });
  const mechanicUser = await signinUser();
  const mechanic = await createMechanicProfile(mechanicUser.accessToken);
  const listingId = await createApprovedListing();

  await request(app).get(`/api/mechanics/${mechanic.id}`).expect(200);
  const activeDiscovery = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );
  expect(activeDiscovery.body.mechanics).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: mechanic.id })]),
  );

  const deactivateResponse = await request(app)
    .patch("/api/mechanics/me/status")
    .send({ isActive: false })
    .auth(mechanicUser.accessToken, { type: "bearer" });
  expect(deactivateResponse.statusCode).toBe(200);
  expect(deactivateResponse.body.mechanic.isActive).toBe(false);

  await request(app).get(`/api/mechanics/${mechanic.id}`).expect(404);
  const inactiveDiscovery = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );
  expect(inactiveDiscovery.body.mechanics).toEqual([]);

  const reactivateResponse = await request(app)
    .patch("/api/mechanics/me/status")
    .send({ isActive: true })
    .auth(mechanicUser.accessToken, { type: "bearer" });
  expect(reactivateResponse.statusCode).toBe(200);
  expect(reactivateResponse.body.mechanic.isActive).toBe(true);

  await request(app).get(`/api/mechanics/${mechanic.id}`).expect(200);
  const reactivatedDiscovery = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );
  expect(reactivatedDiscovery.body.mechanics).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: mechanic.id })]),
  );
});

it("should deny availability updates to non-mechanic users", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const buyerUser = await signinUser();

  await request(app)
    .patch("/api/mechanics/me/status")
    .send({ isActive: false })
    .auth(buyerUser.accessToken, { type: "bearer" })
    .expect(403);
});

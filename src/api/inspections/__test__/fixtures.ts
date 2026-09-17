import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { updateMechanicActiveStatus } from "../../mechanics/db";
import * as fileUtils from "../../../utils/functions";

export const carPayload = {
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
  transmission: "automatic" as const,
  fiscalPower: 8,
  doorsNumber: 5,
  files: [{ name: "car.png", isPrimary: true, type: "image" }],
};

export const createApprovedCar = async (sellerEmail: string) => {
  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({ userType: "seller", email: sellerEmail });
  const seller = await signinUser({ email: sellerEmail });

  const listingResponse = await request(app)
    .post("/api/listings")
    .send({
      title: "A black car for sale",
      description: "A brand new Ford for sale",
    })
    .auth(seller.accessToken, { type: "bearer" });
  const listingId = listingResponse.body.listing.id;

  const carResponse = await request(app)
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

  return { carId: carResponse.body.id as number, listingId, cityId: carPayload.cityId };
};

export const createMechanic = async (
  email: string,
  options?: { cityId?: number; inspectionPrice?: number; isActive?: boolean },
) => {
  const { cityId = 1, inspectionPrice = 300, isActive = true } = options || {};

  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({ userType: "mechanic", email });
  const mechanicUser = await signinUser({ email });

  const response = await request(app)
    .post("/api/mechanics")
    .send({
      name: "Atlas Auto Care",
      cityId,
      address: "12 Rue Example",
      latitude: 33.5731,
      longitude: -7.5898,
      inspectionPrice,
    })
    .auth(mechanicUser.accessToken, { type: "bearer" });

  if (!isActive) {
    await updateMechanicActiveStatus(response.body.mechanic.id, false);
  }

  return { mechanic: response.body.mechanic, mechanicUser };
};

export const createBuyer = async (email: string) => {
  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({ userType: "buyer", email });
  return await signinUser({ email });
};

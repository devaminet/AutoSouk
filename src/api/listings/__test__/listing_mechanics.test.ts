import request from "supertest";
import { app } from "../../../app";
import {
  insertMechanicGarageImage,
  updateMechanicActiveStatus,
} from "../../mechanics/db";
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

const createMechanicProfile = async (
  email: string,
  name: string,
  isActive: boolean,
) => {
  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({ userType: "mechanic", email });
  const mechanicUser = await signinUser({ email });

  const response = await request(app)
    .post("/api/mechanics")
    .send({
      name,
      cityId: 1,
      address: "12 Rue Example",
      latitude: 33.5731,
      longitude: -7.5898,
    })
    .auth(mechanicUser.accessToken, { type: "bearer" });

  await updateMechanicActiveStatus(response.body.mechanic.id, isActive);

  return response.body.mechanic;
};

it("should return active mechanics in the approved listing city with their garage images", async () => {
  jest
    .spyOn(fileUtils, "generateGetPresignedUrls")
    .mockResolvedValue(
      new Map([["garage.jpg", "https://storage.test/garage.jpg"]]),
    );

  const firstMechanic = await createMechanicProfile(
    "first-mechanic@example.com",
    "Atlas Auto Care",
    true,
  );
  const secondMechanic = await createMechanicProfile(
    "second-mechanic@example.com",
    "Agadir Garage",
    true,
  );
  await createMechanicProfile(
    "inactive-mechanic@example.com",
    "Inactive Garage",
    false,
  );
  await insertMechanicGarageImage(firstMechanic.id, "garage.jpg");

  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({ userType: "seller" });
  const seller = await signinUser();
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

  const response = await request(app).get(
    `/api/listings/${listingId}/mechanics`,
  );

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanics).toHaveLength(2);
  expect(response.body.mechanics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: firstMechanic.id,
        name: "Atlas Auto Care",
        latitude: 33.5731,
        longitude: -7.5898,
        garageImages: [
          expect.objectContaining({ link: "https://storage.test/garage.jpg" }),
        ],
      }),
      expect.objectContaining({
        id: secondMechanic.id,
        name: "Agadir Garage",
        latitude: 33.5731,
        longitude: -7.5898,
      }),
    ]),
  );
  expect(response.body.mechanics).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "Inactive Garage" }),
    ]),
  );
});

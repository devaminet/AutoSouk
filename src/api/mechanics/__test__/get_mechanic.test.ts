import request from "supertest";
import { app } from "../../../app";
import { insertMechanicGarageImage, updateMechanicActiveStatus } from "../db";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import * as fileUtils from "../../../utils/functions";

const validMechanicPayload = {
  name: "Atlas Auto Care",
  cityId: 1,
  address: "12 Rue Example",
  latitude: 33.5731,
  longitude: -7.5898,
  description: "Certified multi-brand inspection garage.",
  phone: "+212600000000",
  inspectionPrice: 300,
};

const createMechanicProfile = async (accessToken: string) => {
  const response = await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  return response.body.mechanic;
};

it("should return an active mechanic's full public profile and garage images", async () => {
  jest
    .spyOn(fileUtils, "generateGetPresignedUrls")
    .mockResolvedValue(
      new Map([["atlas-garage.jpg", "https://storage.test/atlas-garage.jpg"]]),
    );
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  const mechanic = await createMechanicProfile(authUser.accessToken);
  const garageImage = await insertMechanicGarageImage(
    mechanic.id,
    "atlas-garage.jpg",
  );

  const response = await request(app).get(`/api/mechanics/${mechanic.id}`);

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanic).toMatchObject({
    id: mechanic.id,
    name: validMechanicPayload.name,
    cityId: validMechanicPayload.cityId,
    address: validMechanicPayload.address,
    latitude: validMechanicPayload.latitude,
    longitude: validMechanicPayload.longitude,
    description: validMechanicPayload.description,
    phone: validMechanicPayload.phone,
    inspectionPrice: validMechanicPayload.inspectionPrice,
    isActive: true,
  });
  expect(response.body.mechanic.garageImages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: garageImage.id,
        link: expect.any(String),
      }),
    ]),
  );
});

it("should return 404 for an inactive mechanic profile requested publicly", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  const mechanic = await createMechanicProfile(authUser.accessToken);
  await updateMechanicActiveStatus(mechanic.id, false);

  await request(app).get(`/api/mechanics/${mechanic.id}`).expect(404);
});

it("should return an inactive mechanic profile to its owner", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  const mechanic = await createMechanicProfile(authUser.accessToken);
  await updateMechanicActiveStatus(mechanic.id, false);

  const response = await request(app)
    .get(`/api/mechanics/${mechanic.id}`)
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanic.id).toBe(mechanic.id);
  expect(response.body.mechanic.isActive).toBe(false);
});

import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { insertMechanicGarageImage } from "../db";
import * as fileUtils from "../../../utils/functions";

const validMechanicPayload = {
  name: "Atlas Auto Care",
  cityId: 1,
  address: "12 Rue Example",
  latitude: 33.5731,
  longitude: -7.5898,
};

const createMechanicProfile = async (accessToken: string) => {
  const response = await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  return response.body.mechanic;
};

it("should add garage images and return presigned upload URLs", async () => {
  jest
    .spyOn(fileUtils, "generatePresignedUrls")
    .mockResolvedValue(
      new Map([["atlas-garage.jpg", "https://storage.test/atlas-garage.jpg"]]),
    );
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  const response = await request(app)
    .post("/api/mechanics/me/garage-images")
    .send({ filenames: ["atlas-garage.jpg"] })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  expect(response.body.garageImages).toEqual([
    expect.objectContaining({
      id: expect.any(Number),
      filename: "atlas-garage.jpg",
      signedUrl: "https://storage.test/atlas-garage.jpg",
    }),
  ]);
});

it("should return an empty garage image list for a profile without images", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  const response = await request(app)
    .get("/api/mechanics/me")
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanic.garageImages).toEqual([]);
});

it("should remove a garage image owned by the mechanic", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  const mechanic = await createMechanicProfile(authUser.accessToken);
  const garageImage = await insertMechanicGarageImage(
    mechanic.id,
    "atlas-garage.jpg",
  );

  const deleteResponse = await request(app)
    .delete(`/api/mechanics/me/garage-images/${garageImage.id}`)
    .auth(authUser.accessToken, { type: "bearer" });

  expect(deleteResponse.statusCode).toBe(200);
  expect(deleteResponse.body).toEqual({
    deleted: true,
    imageId: garageImage.id,
  });

  const profileResponse = await request(app)
    .get("/api/mechanics/me")
    .auth(authUser.accessToken, { type: "bearer" });
  expect(profileResponse.body.mechanic.garageImages).toEqual([]);
});

it("should prevent a mechanic from deleting another mechanic's garage image", async () => {
  await signupUserWithVerification({
    userType: "mechanic",
    email: "first-mechanic@example.com",
  });
  const firstMechanicUser = await signinUser({
    email: "first-mechanic@example.com",
  });
  const firstMechanic = await createMechanicProfile(
    firstMechanicUser.accessToken,
  );
  const garageImage = await insertMechanicGarageImage(
    firstMechanic.id,
    "first-garage.jpg",
  );

  (fileUtils.readTemplateFile as jest.Mock).mockClear();
  await signupUserWithVerification({
    userType: "mechanic",
    email: "second-mechanic@example.com",
  });
  const secondMechanicUser = await signinUser({
    email: "second-mechanic@example.com",
  });
  await createMechanicProfile(secondMechanicUser.accessToken);

  await request(app)
    .delete(`/api/mechanics/me/garage-images/${garageImage.id}`)
    .auth(secondMechanicUser.accessToken, { type: "bearer" })
    .expect(404);
});

it("should reject a non-image filename", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const mechanicUser = await signinUser();
  await createMechanicProfile(mechanicUser.accessToken);

  await request(app)
    .post("/api/mechanics/me/garage-images")
    .send({ filenames: ["atlas-garage.pdf"] })
    .auth(mechanicUser.accessToken, { type: "bearer" })
    .expect(400);
});

it("should reject a non-mechanic uploader", async () => {
  await signupUserWithVerification({
    userType: "buyer",
    email: "buyer@example.com",
  });
  const buyerUser = await signinUser({ email: "buyer@example.com" });

  await request(app)
    .post("/api/mechanics/me/garage-images")
    .send({ filenames: ["atlas-garage.jpg"] })
    .auth(buyerUser.accessToken, { type: "bearer" })
    .expect(403);
});

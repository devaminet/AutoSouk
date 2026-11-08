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

it("should fail if the user who wants to create a mechanic profile is not logged in", () => {
  return request(app).post("/api/mechanics").expect(401);
});

it("should fail if user is not of type mechanic", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();
  const response = await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(403);
});

it("should reject a profile submitted without latitude/longitude", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  const { latitude, longitude, ...payloadWithoutCoordinates } =
    validMechanicPayload;

  const response = await request(app)
    .post("/api/mechanics")
    .send(payloadWithoutCoordinates)
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
});

it("should create a mechanic profile and return it", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  expect(authUser.user.role).toBe("mechanic");

  const response = await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(201);
  expect(response.body.mechanic.name).toBe(validMechanicPayload.name);
  expect(response.body.mechanic.cityId).toBe(validMechanicPayload.cityId);
  expect(response.body.mechanic.latitude).toBe(validMechanicPayload.latitude);
  expect(response.body.mechanic.longitude).toBe(validMechanicPayload.longitude);
});

it("should reject a second profile creation attempt for the same mechanic", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();

  await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(authUser.accessToken, { type: "bearer" });

  const secondResponse = await request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(authUser.accessToken, { type: "bearer" });

  expect(secondResponse.statusCode).toBe(400);
});

it("should refuse a pin outside the chosen city", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();

  // Casablanca's centre, with Agadir as the city.
  const response = await request(app)
    .post("/api/mechanics")
    .send({ ...validMechanicPayload, latitude: 33.5731, longitude: -7.5898 })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
  expect(response.body.errors[0]).toMatchObject({
    code: "mechanic.location_outside_city",
    field: "latitude",
  });
});

it("should refuse a city that doesn't exist", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();

  const response = await request(app)
    .post("/api/mechanics")
    .send({ ...validMechanicPayload, cityId: 99999 })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
  expect(response.body.errors[0].field).toBe("cityId");
});

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

const createMechanicProfile = async (accessToken: string) => {
  return request(app)
    .post("/api/mechanics")
    .send(validMechanicPayload)
    .auth(accessToken, { type: "bearer" });
};

it("should return 404 when the mechanic has not created a profile", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();

  const response = await request(app)
    .get("/api/mechanics/me")
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(404);
});

it("should retrieve the authenticated mechanic's profile", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  const response = await request(app)
    .get("/api/mechanics/me")
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanic.name).toBe(validMechanicPayload.name);
  expect(response.body.mechanic.cityId).toBe(validMechanicPayload.cityId);
});

it("should persist a partial update to the authenticated mechanic's profile", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  const updatePayload = {
    description: "Certified multi-brand inspection garage.",
    inspectionPrice: 300,
  };
  const updateResponse = await request(app)
    .patch("/api/mechanics/me")
    .send(updatePayload)
    .auth(authUser.accessToken, { type: "bearer" });

  expect(updateResponse.statusCode).toBe(200);
  expect(updateResponse.body.mechanic.description).toBe(
    updatePayload.description,
  );
  expect(updateResponse.body.mechanic.inspectionPrice).toBe(
    updatePayload.inspectionPrice,
  );

  const getResponse = await request(app)
    .get("/api/mechanics/me")
    .auth(authUser.accessToken, { type: "bearer" });

  expect(getResponse.statusCode).toBe(200);
  expect(getResponse.body.mechanic.description).toBe(updatePayload.description);
  expect(getResponse.body.mechanic.inspectionPrice).toBe(
    updatePayload.inspectionPrice,
  );
});

it("should clear optional details sent as null", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await request(app)
    .post("/api/mechanics")
    .send({
      ...validMechanicPayload,
      description: "Full check",
      phone: "0661234567",
      inspectionPrice: 350,
    })
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(201);

  const response = await request(app)
    .patch("/api/mechanics/me")
    .send({ description: null, phone: null, inspectionPrice: null })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.mechanic).toMatchObject({
    description: null,
    phone: null,
    inspectionPrice: null,
  });
});

it("should reject an empty workshop name", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  const response = await request(app)
    .patch("/api/mechanics/me")
    .send({ name: "   " })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
  expect(response.body.errors[0].field).toBe("name");
});

it("should store a new profile image under a name of its own, and remove it", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  const response = await request(app)
    .patch("/api/mechanics/me")
    .send({ profileImageFilename: "logo.png" })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.profileImageUpload.url).toContain("/mechanics");
  expect(response.body.profileImageUpload.fields.key).toMatch(
    /^mechanic-[0-9a-f]{32}\.png$/,
  );
  expect(response.body.mechanic.profileImageUrl).toContain(
    response.body.profileImageUpload.fields.key,
  );

  const removed = await request(app)
    .patch("/api/mechanics/me")
    .send({ profileImageFilename: null })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(removed.statusCode).toBe(200);
  expect(removed.body.mechanic.profileImageUrl).toBeNull();
  expect(removed.body.profileImageUpload).toBeUndefined();
});

it("should reject a profile image that isn't an image", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);

  await request(app)
    .patch("/api/mechanics/me")
    .send({ profileImageFilename: "logo.pdf" })
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(400);
});

it("should check the pin against a new city, and accept both changed together", async () => {
  await signupUserWithVerification({ userType: "mechanic" });
  const authUser = await signinUser();
  await createMechanicProfile(authUser.accessToken);
  const { body } = await request(app).get("/api/lookups");
  const casablanca = body.cities.find(
    ({ slug }: { slug: string }) => slug === "casablanca",
  );

  const cityOnly = await request(app)
    .patch("/api/mechanics/me")
    .send({ cityId: casablanca.id })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(cityOnly.statusCode).toBe(400);
  expect(cityOnly.body.errors[0].code).toBe("mechanic.location_outside_city");

  const both = await request(app)
    .patch("/api/mechanics/me")
    .send({ cityId: casablanca.id, latitude: 33.589, longitude: -7.62 })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(both.statusCode).toBe(200);
  expect(both.body.mechanic.cityId).toBe(casablanca.id);
});

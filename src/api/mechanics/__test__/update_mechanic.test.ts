import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

const validMechanicPayload = {
  name: "Atlas Auto Care",
  cityId: 1,
  address: "12 Rue Example",
  latitude: 33.5731,
  longitude: -7.5898,
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

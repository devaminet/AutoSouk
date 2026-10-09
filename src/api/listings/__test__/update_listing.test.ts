import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

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
  files: [{ name: "file1.png", isPrimary: true }],
};

const createListingWithCar = async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });
  const listingId = created.body.listing.id;
  await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(authUser.accessToken, { type: "bearer" });
  return { authUser, listingId };
};

it("should fail when not logged in", () => {
  return request(app).patch("/api/listings/1").send({ title: "x" }).expect(401);
});

it("should fail validation when body is empty", async () => {
  const { authUser, listingId } = await createListingWithCar();
  const response = await request(app)
    .patch(`/api/listings/${listingId}`)
    .send({})
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(400);
});

it("should fail when listing does not belong to the seller", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const response = await request(app)
    .patch("/api/listings/9999")
    .send({ title: "New title" })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(404);
});

it("should update listing and car, and mark the listing pending", async () => {
  const { authUser, listingId } = await createListingWithCar();
  const admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  await request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" });

  const response = await request(app)
    .patch(`/api/listings/${listingId}`)
    .send({ title: "Updated title", car: { price: 450000 } })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(200);
  expect(response.body.listing.status).toBe("pending");
  expect(response.body.listing.approvedAt).toBeNull();
  expect(response.body.listing.title).toBe("Updated title");

  const details = await request(app).get(`/api/listings/${listingId}`);
  expect(details.body.listing.car.price).toBe(450000);
});

import request from "supertest";
import { app } from "../../../app";
import {
  submitWithImages,
  addUploadedCarImages,
  signinUser,
  signupUserWithVerification,
} from "../../../test/helpers";

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
};

let seller: Awaited<ReturnType<typeof signinUser>>;

const createListing = async (
  token = seller.accessToken,
  title = "A black car",
) => {
  const response = await request(app)
    .post("/api/listings")
    .send({ title, description: "A brand new black Ford" })
    .auth(token, { type: "bearer" })
    .expect(201);
  return response.body.listing.id as number;
};

const attachCar = async (listingId: number) => {
  const response = await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);
  return response.body.id as number;
};

const approve = async (listingId: number) => {
  const admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  await request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" })
    .expect(200);
};

const getMine = (query = "", token = seller.accessToken) =>
  request(app)
    .get(`/api/listings/mine${query}`)
    .auth(token, { type: "bearer" });

beforeEach(async () => {
  await signupUserWithVerification({ userType: "seller" });
  seller = await signinUser();
});

describe("GET /api/listings/mine", () => {
  it("requires authentication", () => {
    return request(app).get("/api/listings/mine").expect(401);
  });

  it("is only for sellers", async () => {
    await signupUserWithVerification({
      userType: "buyer",
      email: "buyer@example.com",
    });
    const buyer = await signinUser({ email: "buyer@example.com" });

    await getMine("", buyer.accessToken).expect(403);
  });

  it("lists the seller's listings in every status, newest first", async () => {
    const draft = await createListing();
    const pending = await createListing();
    await attachCar(pending);
    await submitWithImages(pending, seller.accessToken);
    const approved = await createListing();
    await attachCar(approved);
    await submitWithImages(approved, seller.accessToken);
    await approve(approved);

    const { body } = await getMine().expect(200);

    expect(
      body.listings.map(({ id, status }: { id: number; status: string }) => [
        id,
        status,
      ]),
    ).toEqual([
      [approved, "approved"],
      [pending, "pending"],
      [draft, "draft"],
    ]);
    expect(body.meta).toEqual({
      total: 3,
      page: 1,
      limit: 10,
      totalPages: 1,
      statusCounts: {
        draft: 1,
        pending: 1,
        approved: 1,
        withdrawn: 0,
        rejected: 0,
        sold: 0,
      },
    });
  });

  it("returns a draft without a car", async () => {
    await createListing();

    const { body } = await getMine().expect(200);

    expect(body.listings[0]).toMatchObject({ status: "draft", car: null });
  });

  it("does not list other sellers' listings", async () => {
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    const other = await signinUser({ email: "other@example.com" });
    await createListing(other.accessToken);
    const mine = await createListing();

    const { body } = await getMine().expect(200);

    expect(body.listings.map(({ id }: { id: number }) => id)).toEqual([mine]);
    expect(body.meta.total).toBe(1);
  });

  it("filters by status", async () => {
    const draft = await createListing();
    const approved = await createListing();
    await attachCar(approved);
    await submitWithImages(approved, seller.accessToken);
    await approve(approved);

    const { body } = await getMine("?status=draft").expect(200);

    expect(body.listings.map(({ id }: { id: number }) => id)).toEqual([draft]);
    expect(body.meta.total).toBe(1);
  });

  it("rejects an unknown status", async () => {
    const { body } = await getMine("?status=lost").expect(400);

    expect(body.errors[0]).toMatchObject({
      code: "validation.invalid_option",
      field: "status",
    });
  });

  it("pages through the listings", async () => {
    const oldest = await createListing();
    const newest = await createListing();

    const first = await getMine("?limit=1&page=1").expect(200);
    const second = await getMine("?limit=1&page=2").expect(200);

    expect(first.body.listings[0].id).toBe(newest);
    expect(second.body.listings[0].id).toBe(oldest);
    expect(first.body.meta).toMatchObject({ total: 2, totalPages: 2 });
  });

  it("returns car details with only uploaded media, primary first", async () => {
    const listingId = await createListing();
    const carId = await attachCar(listingId);
    await addUploadedCarImages(listingId);

    const { body } = await getMine().expect(200);
    const { car } = body.listings[0];

    expect(car).toMatchObject({
      id: carId,
      price: carPayload.price,
      year: carPayload.year,
      distance: carPayload.distance,
      make: { name: expect.any(String) },
      model: { name: expect.any(String) },
      city: { name: expect.any(String), slug: expect.any(String) },
    });
    expect(car.carMedias).toHaveLength(3);
    expect(car.carMedias[0]).toMatchObject({
      isPrimary: true,
      type: "image",
      link: expect.stringContaining("http"),
    });
  });

  it("hides media that was not uploaded yet", async () => {
    const listingId = await createListing();
    await attachCar(listingId);
    await request(app)
      .post(`/api/listings/${listingId}/media`)
      .send({ files: [{ name: "side.png" }] })
      .auth(seller.accessToken, { type: "bearer" })
      .expect(201);

    const { body } = await getMine().expect(200);

    expect(body.listings[0].car.carMedias).toEqual([]);
  });
});

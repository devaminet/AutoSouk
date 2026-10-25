import request from "supertest";
import { ne } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { carModelTable } from "../../../db/schema/car_model";
import {
  carImageFiles,
  signinUser,
  signupUserWithVerification,
} from "../../../test/helpers";

const baseCar = {
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
  files: carImageFiles(),
};

let seller: Awaited<ReturnType<typeof signinUser>>;
let admin: Awaited<ReturnType<typeof signinUser>>;

const createListing = async () => {
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);
  return created.body.listing.id as number;
};

const publishCar = async (car: Record<string, unknown>) => {
  const listingId = await createListing();
  await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send({ ...baseCar, ...car })
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);
  await request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" })
    .expect(200);
  return listingId;
};

const listedIds = (body: { listings: { id: number }[] }) =>
  body.listings.map(({ id }) => id);

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

let cheap: number;
let middle: number;
let expensive: number;
let otherMake: { makeId: number; modelId: number };

beforeEach(async () => {
  await signupUserWithVerification({ userType: "seller" });
  seller = await signinUser();
  admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });

  const [model] = await db
    .select({ makeId: carModelTable.makeId, modelId: carModelTable.id })
    .from(carModelTable)
    .where(ne(carModelTable.makeId, baseCar.makeId))
    .limit(1);
  otherMake = { makeId: model.makeId!, modelId: model.modelId };

  cheap = await publishCar({ price: 100000 });
  middle = await publishCar({ price: 300000, cityId: 2 });
  expensive = await publishCar({ price: 900000, ...otherMake });
});

describe("GET /api/listings filters", () => {
  it("filters by make", async () => {
    const response = await request(app)
      .get(`/api/listings?makeId=${otherMake.makeId}`)
      .expect(200);

    expect(listedIds(response.body)).toEqual([expensive]);
    expect(response.body.meta.total).toBe(1);
  });

  it("filters by model", async () => {
    const response = await request(app)
      .get(`/api/listings?modelId=${baseCar.modelId}`)
      .expect(200);

    expect(sorted(listedIds(response.body))).toEqual(sorted([cheap, middle]));
    expect(response.body.meta.total).toBe(2);
  });

  it("filters by city", async () => {
    const response = await request(app)
      .get("/api/listings?cityId=2")
      .expect(200);

    expect(listedIds(response.body)).toEqual([middle]);
  });

  it("filters by price range", async () => {
    const response = await request(app)
      .get("/api/listings?minPrice=200000&maxPrice=500000")
      .expect(200);

    expect(listedIds(response.body)).toEqual([middle]);
  });

  it("combines filters", async () => {
    const response = await request(app)
      .get(`/api/listings?makeId=${baseCar.makeId}&maxPrice=200000`)
      .expect(200);

    expect(listedIds(response.body)).toEqual([cheap]);
  });

  it("returns an empty page when nothing matches", async () => {
    const response = await request(app)
      .get("/api/listings?minPrice=5000000")
      .expect(200);

    expect(response.body.listings).toEqual([]);
    expect(response.body.meta).toMatchObject({ total: 0, totalPages: 0 });
  });

  it("only lists approved listings", async () => {
    await createListing();

    const response = await request(app).get("/api/listings").expect(200);

    expect(sorted(listedIds(response.body))).toEqual(
      sorted([cheap, middle, expensive]),
    );
  });
});

describe("GET /api/listings sorting and paging", () => {
  it("sorts by price ascending", async () => {
    const response = await request(app)
      .get("/api/listings?sort=price_asc")
      .expect(200);

    expect(listedIds(response.body)).toEqual([cheap, middle, expensive]);
  });

  it("sorts by price descending", async () => {
    const response = await request(app)
      .get("/api/listings?sort=price_desc")
      .expect(200);

    expect(listedIds(response.body)).toEqual([expensive, middle, cheap]);
  });

  it("sorts by newest and oldest", async () => {
    const newest = await request(app)
      .get("/api/listings?sort=newest")
      .expect(200);
    const oldest = await request(app)
      .get("/api/listings?sort=oldest")
      .expect(200);

    expect(listedIds(newest.body)).toEqual([expensive, middle, cheap]);
    expect(listedIds(oldest.body)).toEqual([cheap, middle, expensive]);
  });

  it("pages through sorted results without gaps or repeats", async () => {
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        request(app)
          .get(`/api/listings?sort=price_asc&limit=1&page=${page}`)
          .expect(200),
      ),
    );

    expect(pages.flatMap(({ body }) => listedIds(body))).toEqual([
      cheap,
      middle,
      expensive,
    ]);
    expect(pages[0].body.meta).toMatchObject({ total: 3, totalPages: 3 });
  });

  it("keeps the listing payload with media and city", async () => {
    const response = await request(app)
      .get("/api/listings?cityId=2")
      .expect(200);

    expect(response.body.listings[0]).toMatchObject({
      id: middle,
      title: "A black car",
      user: expect.objectContaining({ firstName: expect.any(String) }),
      car: { city: { name: expect.any(String) }, carMedias: [] },
    });
  });
});

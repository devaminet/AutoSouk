import request from "supertest";
import { eq, ne } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { carTable } from "../../../db/schema/car";
import { carModelTable } from "../../../db/schema/car_model";
import { carCarburantTable } from "../../../db/schema/carburant";
import { inspectionTable } from "../../../db/schema/inspection";
import {
  createBuyer,
  createMechanic,
} from "../../inspections/__test__/fixtures";
import {
  submitWithImages,
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
  await submitWithImages(listingId, seller.accessToken);
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

  it("filters by transmission", async () => {
    const manual = await publishCar({ transmission: "manual" });

    const response = await request(app)
      .get("/api/listings?transmission=manual")
      .expect(200);

    expect(listedIds(response.body)).toEqual([manual]);
  });

  it("refuses an unknown transmission", async () => {
    await request(app).get("/api/listings?transmission=cvt").expect(400);
  });

  it("filters by any of several fuels", async () => {
    const otherFuel = await publishCar({ carburantId: 1 });
    await publishCar({ carburantId: 2 });

    const response = await request(app)
      .get(`/api/listings?carburantIds=1,${baseCar.carburantId}`)
      .expect(200);

    expect(sorted(listedIds(response.body))).toEqual(
      sorted([cheap, middle, expensive, otherFuel]),
    );
    expect(response.body.meta.total).toBe(4);
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
      car: {
        city: { name: expect.any(String) },
        carMedias: expect.arrayContaining([
          expect.objectContaining({ isPrimary: true, type: "image" }),
        ]),
      },
    });
  });
});

describe("GET /api/listings cards", () => {
  const findListing = async (id: number) => {
    const response = await request(app).get("/api/listings").expect(200);
    return response.body.listings.find(
      (listing: { id: number }) => listing.id === id,
    );
  };

  it("returns the car's price and specs", async () => {
    const [fuel] = await db
      .select({ slug: carCarburantTable.carburant })
      .from(carCarburantTable)
      .where(eq(carCarburantTable.id, baseCar.carburantId));

    const listing = await findListing(cheap);

    expect(listing.car).toMatchObject({
      price: 100000,
      year: baseCar.year,
      distance: baseCar.distance,
      transmission: baseCar.transmission,
      carburant: { carburant: fuel.slug },
    });
    expect(listing.inspectionScore).toBeNull();
  });

  it("returns the score of the latest completed inspection", async () => {
    const [car] = await db
      .select({ id: carTable.id })
      .from(carTable)
      .where(eq(carTable.listingId, middle));
    const { mechanic } = await createMechanic("mechanic@example.com");
    const buyer = await createBuyer("buyer@example.com");
    const inspection = {
      carId: car.id,
      buyerId: buyer.user.id,
      mechanicId: mechanic.id,
      priceAtRequest: 300,
    };
    await db.insert(inspectionTable).values([
      {
        ...inspection,
        status: "completed",
        overallScore: 70,
        completedAt: new Date("2025-01-01"),
      },
      {
        ...inspection,
        status: "completed",
        overallScore: 92,
        completedAt: new Date("2025-06-01"),
      },
      { ...inspection, status: "pending" },
    ]);

    expect((await findListing(middle)).inspectionScore).toBe(92);
    expect((await findListing(cheap)).inspectionScore).toBeNull();
  });
});

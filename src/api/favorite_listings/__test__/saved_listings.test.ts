import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { carTable } from "../../../db/schema/car";
import { favoriteListingsTable } from "../../../db/schema/favorite_listing";
import { inspectionTable } from "../../../db/schema/inspection";
import { listingTable } from "../../../db/schema/listing";
import { createBucket } from "../../../utils/functions";
import { carBucketName } from "../../../utils/constants";
import {
  createApprovedCar,
  createBuyer,
  createMechanic,
} from "../../inspections/__test__/fixtures";

beforeAll(async () => {
  await createBucket(carBucketName);
});

type Buyer = Awaited<ReturnType<typeof createBuyer>>;

let buyer: Buyer;
// Saved in this order, a day apart: cheap first, then inspected, then sold.
let cheap: number;
let inspected: number;
let sold: number;

const save = async (listingId: number, savedAt: Date) => {
  await request(app)
    .post("/api/favorite_listings")
    .send({ listingId })
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(201);
  await db
    .update(favoriteListingsTable)
    .set({ createdAt: savedAt })
    .where(eq(favoriteListingsTable.listingId, listingId));
};

const savedListings = async (query = "") =>
  (
    await request(app)
      .get(`/api/favorite_listings${query}`)
      .auth(buyer.accessToken, { type: "bearer" })
      .expect(200)
  ).body;

const ids = (body: { listings: { id: number }[] }) =>
  body.listings.map(({ id }) => id);

beforeEach(async () => {
  const first = await createApprovedCar("cheap@example.com");
  const second = await createApprovedCar("inspected@example.com");
  const third = await createApprovedCar("sold@example.com");
  cheap = first.listingId;
  inspected = second.listingId;
  sold = third.listingId;
  await db
    .update(carTable)
    .set({ price: 90000 })
    .where(eq(carTable.id, first.carId));
  await db
    .update(carTable)
    .set({ price: 200000 })
    .where(eq(carTable.id, second.carId));

  buyer = await createBuyer("buyer@example.com");
  const { mechanic } = await createMechanic("mechanic@example.com");
  await db.insert(inspectionTable).values({
    carId: second.carId,
    buyerId: buyer.user.id,
    mechanicId: mechanic.id,
    priceAtRequest: 300,
    status: "completed",
    overallScore: 88,
    completedAt: new Date("2025-06-01"),
  });

  await save(cheap, new Date("2026-01-01T10:00:00Z"));
  await save(inspected, new Date("2026-01-02T10:00:00Z"));
  await save(sold, new Date("2026-01-03T10:00:00Z"));
  // Buyers can no longer see it, but it stays in their list.
  await db
    .update(listingTable)
    .set({ status: "sold" })
    .where(eq(listingTable.id, sold));
});

describe("GET /api/favorite_listings", () => {
  it("lists the latest saved first, with card details and counts", async () => {
    const body = await savedListings();

    expect(ids(body)).toEqual([sold, inspected, cheap]);
    expect(body.meta).toEqual({ total: 3, page: 1, limit: 12, totalPages: 1 });
    expect(body.counts).toEqual({ all: 3, inspected: 1 });

    const [soldListing, inspectedListing] = body.listings;
    expect(soldListing.status).toBe("sold");
    expect(soldListing.savedAt).toBe("2026-01-03T10:00:00.000Z");
    expect(inspectedListing).toMatchObject({
      status: "approved",
      inspectionScore: 88,
      car: {
        id: expect.any(Number),
        makeId: 449,
        modelId: 2085,
        price: 200000,
        year: 2025,
        transmission: "automatic",
        city: { slug: expect.any(String) },
      },
    });
    expect(inspectedListing.car.carMedias.length).toBeGreaterThanOrEqual(3);
    expect(inspectedListing.car.carMedias[0].isPrimary).toBe(true);
  });

  it("filters by inspection, keeping the counts of every saved listing", async () => {
    const onlyInspected = await savedListings("?inspected=true");
    expect(ids(onlyInspected)).toEqual([inspected]);
    expect(onlyInspected.meta.total).toBe(1);
    expect(onlyInspected.counts).toEqual({ all: 3, inspected: 1 });

    const notInspected = await savedListings("?inspected=false");
    expect(ids(notInspected)).toEqual([sold, cheap]);
    expect(notInspected.meta.total).toBe(2);
  });

  it("filters by the car's city", async () => {
    const [car] = await db
      .select({ cityId: carTable.cityId })
      .from(carTable)
      .where(eq(carTable.listingId, cheap));
    const otherCity = car.cityId === 1 ? 2 : 1;
    await db
      .update(carTable)
      .set({ cityId: otherCity })
      .where(eq(carTable.listingId, cheap));

    expect(ids(await savedListings(`?cityId=${otherCity}`))).toEqual([cheap]);
    expect(ids(await savedListings(`?cityId=${car.cityId}`))).toEqual([
      sold,
      inspected,
    ]);
  });

  it("sorts by price", async () => {
    expect(ids(await savedListings("?sort=price_asc"))).toEqual([
      cheap,
      inspected,
      sold,
    ]);
    expect(ids(await savedListings("?sort=price_desc"))).toEqual([
      sold,
      inspected,
      cheap,
    ]);
  });

  it("pages through the list", async () => {
    const second = await savedListings("?limit=2&page=2");
    expect(ids(second)).toEqual([cheap]);
    expect(second.meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
  });

  it("refuses an unknown filter or sort", async () => {
    for (const query of ["?inspected=yes", "?sort=cheap", "?limit=0"]) {
      await request(app)
        .get(`/api/favorite_listings${query}`)
        .auth(buyer.accessToken, { type: "bearer" })
        .expect(400);
    }
  });

  it("shows only the buyer's own saved listings", async () => {
    const other = await createBuyer("other@example.com");
    const response = await request(app)
      .get("/api/favorite_listings")
      .auth(other.accessToken, { type: "bearer" })
      .expect(200);

    expect(response.body.listings).toEqual([]);
    expect(response.body.counts).toEqual({ all: 0, inspected: 0 });
  });
});

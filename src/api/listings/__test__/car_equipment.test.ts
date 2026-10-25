import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import {
  carEquipmentTable,
  equipmentTable,
} from "../../../db/schema/equipment";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

const validCar = {
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

const findEquipmentIds = async (slugs: string[]) => {
  const rows = await db
    .select({ id: equipmentTable.id })
    .from(equipmentTable)
    .where(inArray(equipmentTable.slug, slugs));
  return rows.map(({ id }) => id).sort((a, b) => a - b);
};

const findSavedEquipmentIds = async (carId: number) => {
  const rows = await db
    .select({ id: carEquipmentTable.equipmentId })
    .from(carEquipmentTable)
    .where(eq(carEquipmentTable.carId, carId));
  return rows.map(({ id }) => id).sort((a, b) => a - b);
};

const createListing = async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });
  return { authUser, listingId: created.body.listing.id };
};

const attachCar = async (body: Record<string, unknown>) => {
  const { authUser, listingId } = await createListing();
  return await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(body)
    .auth(authUser.accessToken, { type: "bearer" });
};

describe("car equipment on attach", () => {
  it("saves the selected equipment with the car", async () => {
    const equipmentIds = await findEquipmentIds([
      "abs",
      "cruise_control",
      "panoramic_roof",
    ]);

    const response = await attachCar({ ...validCar, equipmentIds });

    expect(response.statusCode).toBe(201);
    expect(response.body.equipmentIds).toEqual(equipmentIds);
    expect(await findSavedEquipmentIds(response.body.id)).toEqual(equipmentIds);
  });

  it("attaches a car without equipment when the field is omitted", async () => {
    const response = await attachCar(validCar);

    expect(response.statusCode).toBe(201);
    expect(response.body.equipmentIds).toEqual([]);
    expect(await findSavedEquipmentIds(response.body.id)).toEqual([]);
  });

  it("returns 400 for equipment that does not exist", async () => {
    const [absId] = await findEquipmentIds(["abs"]);

    const response = await attachCar({
      ...validCar,
      equipmentIds: [absId, 99999],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { message: "Equipment 99999 does not exist", field: "equipmentIds" },
    ]);
  });

  it("reports missing equipment together with other invalid references", async () => {
    const response = await attachCar({
      ...validCar,
      cityId: 99999,
      equipmentIds: [99999],
    });

    expect(response.statusCode).toBe(400);
    const fields = response.body.errors.map(
      (error: { field: string }) => error.field,
    );
    expect(fields.sort()).toEqual(["cityId", "equipmentIds"]);
  });

  it("returns 400 for duplicate equipment ids", async () => {
    const [absId] = await findEquipmentIds(["abs"]);

    const response = await attachCar({
      ...validCar,
      equipmentIds: [absId, absId],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { message: "Equipment ids must be unique", field: "equipmentIds" },
    ]);
  });

  it("returns 400 when equipment ids are not whole positive numbers", async () => {
    const response = await attachCar({
      ...validCar,
      equipmentIds: [1.5, -2, "abs"],
    });

    expect(response.statusCode).toBe(400);
    const fields = response.body.errors.map(
      (error: { field: string }) => error.field,
    );
    expect(fields).toEqual([
      "equipmentIds.0",
      "equipmentIds.1",
      "equipmentIds.2",
    ]);
  });
});

describe("car equipment on update", () => {
  const attachCarWithEquipment = async (slugs: string[]) => {
    const { authUser, listingId } = await createListing();
    const equipmentIds = await findEquipmentIds(slugs);
    const attached = await request(app)
      .post(`/api/listings/${listingId}/car`)
      .send({ ...validCar, equipmentIds })
      .auth(authUser.accessToken, { type: "bearer" });
    return { authUser, listingId, carId: attached.body.id as number };
  };

  const updateCar = (
    listingId: number,
    accessToken: string,
    car: Record<string, unknown>,
  ) =>
    request(app)
      .patch(`/api/listings/${listingId}`)
      .send({ car })
      .auth(accessToken, { type: "bearer" });

  it("replaces the whole equipment set", async () => {
    const { authUser, listingId, carId } = await attachCarWithEquipment([
      "abs",
      "cruise_control",
    ]);
    const equipmentIds = await findEquipmentIds(["abs", "panoramic_roof"]);

    const response = await updateCar(listingId, authUser.accessToken, {
      equipmentIds,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.listing.status).toBe("pending");
    expect(await findSavedEquipmentIds(carId)).toEqual(equipmentIds);
  });

  it("clears the equipment set with an empty list", async () => {
    const { authUser, listingId, carId } = await attachCarWithEquipment([
      "abs",
    ]);

    const response = await updateCar(listingId, authUser.accessToken, {
      equipmentIds: [],
    });

    expect(response.statusCode).toBe(200);
    expect(await findSavedEquipmentIds(carId)).toEqual([]);
  });

  it("keeps the equipment set when the field is omitted", async () => {
    const { authUser, listingId, carId } = await attachCarWithEquipment([
      "abs",
      "bluetooth",
    ]);

    const response = await updateCar(listingId, authUser.accessToken, {
      price: 450000,
    });

    expect(response.statusCode).toBe(200);
    expect(await findSavedEquipmentIds(carId)).toEqual(
      await findEquipmentIds(["abs", "bluetooth"]),
    );
  });

  it("sends an approved listing back to pending", async () => {
    const { authUser, listingId } = await attachCarWithEquipment(["abs"]);
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    await request(app)
      .patch(`/api/listings/${listingId}/approve`)
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    const response = await updateCar(listingId, authUser.accessToken, {
      equipmentIds: await findEquipmentIds(["sunroof"]),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.listing.status).toBe("pending");
    expect(response.body.listing.approvedAt).toBeNull();
  });

  it("returns 400 and keeps the current set for unknown equipment", async () => {
    const { authUser, listingId, carId } = await attachCarWithEquipment([
      "abs",
    ]);

    const response = await updateCar(listingId, authUser.accessToken, {
      equipmentIds: [99999],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { message: "Equipment 99999 does not exist", field: "equipmentIds" },
    ]);
    expect(await findSavedEquipmentIds(carId)).toEqual(
      await findEquipmentIds(["abs"]),
    );
  });

  it("applies concurrent replacements one after the other", async () => {
    const { authUser, listingId, carId } = await attachCarWithEquipment([
      "abs",
    ]);
    const first = await findEquipmentIds(["abs", "sunroof", "radio"]);
    const second = await findEquipmentIds(["abs", "sunroof", "bluetooth"]);

    const responses = await Promise.all([
      updateCar(listingId, authUser.accessToken, { equipmentIds: first }),
      updateCar(listingId, authUser.accessToken, { equipmentIds: second }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
    expect([first, second]).toContainEqual(await findSavedEquipmentIds(carId));
  });
});

describe("car equipment on listing details", () => {
  it("lists the car's equipment with its category in catalog order", async () => {
    const { authUser, listingId } = await createListing();
    // sent out of catalog order on purpose
    const equipmentIds = await findEquipmentIds([
      "alloy_wheels",
      "panoramic_roof",
      "esp",
      "abs",
    ]);
    await request(app)
      .post(`/api/listings/${listingId}/car`)
      .send({ ...validCar, equipmentIds: [...equipmentIds].reverse() })
      .auth(authUser.accessToken, { type: "bearer" })
      .expect(201);

    const response = await request(app)
      .get(`/api/listings/${listingId}`)
      .expect(200);

    const { equipment } = response.body.listing.car;
    expect(equipment.map(({ slug }: { slug: string }) => slug)).toEqual([
      "abs",
      "esp",
      "panoramic_roof",
      "alloy_wheels",
    ]);
    expect(equipment[0]).toEqual({
      id: expect.any(Number),
      slug: "abs",
      name: "ABS",
      category: { slug: "safety", name: "Safety" },
    });
  });

  it("returns an empty list for a car without equipment", async () => {
    const response = await attachCar(validCar);
    const listingId = response.body.listingId;

    const details = await request(app)
      .get(`/api/listings/${listingId}`)
      .expect(200);

    expect(details.body.listing.car.equipment).toEqual([]);
  });
});

describe("filter listings by equipment", () => {
  let seller: Awaited<ReturnType<typeof signinUser>>;
  let admin: Awaited<ReturnType<typeof signinUser>>;

  const publishCar = async (slugs: string[]) => {
    const created = await request(app)
      .post("/api/listings")
      .send({ title: "A black car", description: "A brand new black Ford" })
      .auth(seller.accessToken, { type: "bearer" })
      .expect(201);
    const listingId: number = created.body.listing.id;
    await request(app)
      .post(`/api/listings/${listingId}/car`)
      .send({
        ...validCar,
        equipmentIds: await findEquipmentIds(slugs),
      })
      .auth(seller.accessToken, { type: "bearer" })
      .expect(201);
    await request(app)
      .patch(`/api/listings/${listingId}/approve`)
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);
    return listingId;
  };

  const listedIds = (body: { listings: { id: number }[] }) =>
    body.listings.map(({ id }) => id).sort((a, b) => a - b);

  let withBoth: number;
  let withAbsOnly: number;
  let withNone: number;
  let absId: number;
  let roofId: number;

  beforeEach(async () => {
    await signupUserWithVerification({ userType: "seller" });
    seller = await signinUser();
    admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    withBoth = await publishCar(["abs", "panoramic_roof"]);
    withAbsOnly = await publishCar(["abs"]);
    withNone = await publishCar([]);
    [absId] = await findEquipmentIds(["abs"]);
    [roofId] = await findEquipmentIds(["panoramic_roof"]);
  });

  it("returns only listings that have every requested item", async () => {
    const response = await request(app)
      .get(`/api/listings?equipmentIds=${absId},${roofId}`)
      .expect(200);

    expect(listedIds(response.body)).toEqual([withBoth]);
    expect(response.body.meta.total).toBe(1);
  });

  it("accepts repeated query parameters", async () => {
    const response = await request(app)
      .get(`/api/listings?equipmentIds=${absId}&equipmentIds=${roofId}`)
      .expect(200);

    expect(listedIds(response.body)).toEqual([withBoth]);
  });

  it("matches a single item and ignores duplicates", async () => {
    const response = await request(app)
      .get(`/api/listings?equipmentIds=${absId},${absId}`)
      .expect(200);

    expect(listedIds(response.body)).toEqual(
      [withBoth, withAbsOnly].sort((a, b) => a - b),
    );
  });

  it("counts filtered listings across pages", async () => {
    const response = await request(app)
      .get(`/api/listings?equipmentIds=${absId}&limit=1`)
      .expect(200);

    expect(response.body.listings).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ total: 2, totalPages: 2 });
  });

  it("does not filter when the list is empty", async () => {
    const response = await request(app)
      .get("/api/listings?equipmentIds=")
      .expect(200);

    expect(listedIds(response.body)).toEqual(
      [withBoth, withAbsOnly, withNone].sort((a, b) => a - b),
    );
  });

  it("returns 400 for ids that are not whole positive numbers", async () => {
    const response = await request(app)
      .get("/api/listings?equipmentIds=abs,-1")
      .expect(400);

    expect(
      response.body.errors.map((error: { field: string }) => error.field),
    ).toEqual(["equipmentIds.0", "equipmentIds.1"]);
  });
});

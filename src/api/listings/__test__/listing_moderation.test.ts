import request from "supertest";
import { app } from "../../../app";
import {
  carImageFiles,
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
  files: carImageFiles(),
};

let seller: Awaited<ReturnType<typeof signinUser>>;
let admin: Awaited<ReturnType<typeof signinUser>>;

const createListing = async () => {
  const response = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);
  return response.body.listing.id as number;
};

const createPendingListing = async () => {
  const listingId = await createListing();
  await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(seller.accessToken, { type: "bearer" })
    .expect(201);
  return listingId;
};

const approve = (listingId: number) =>
  request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" });

const reject = (listingId: number, reason: unknown = "Blurry photos") =>
  request(app)
    .patch(`/api/listings/${listingId}/reject`)
    .send({ reason })
    .auth(admin.accessToken, { type: "bearer" });

const getPending = (query = "") =>
  request(app)
    .get(`/api/listings/pending${query}`)
    .auth(admin.accessToken, { type: "bearer" });

const signupOther = async (userType: "buyer" | "seller") => {
  const email = `other-${userType}@example.com`;
  await signupUserWithVerification({ userType, email });
  return await signinUser({ email });
};

const listedIds = (body: { listings: { id: number }[] }) =>
  body.listings.map(({ id }) => id);

beforeEach(async () => {
  await signupUserWithVerification({ userType: "seller" });
  seller = await signinUser();
  admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
});

describe("GET /api/listings/pending", () => {
  it("requires authentication", () => {
    return request(app).get("/api/listings/pending").expect(401);
  });

  it("is only for admins", () => {
    return request(app)
      .get("/api/listings/pending")
      .auth(seller.accessToken, { type: "bearer" })
      .expect(403);
  });

  it("lists only pending listings, the longest waiting first", async () => {
    await createListing();
    const first = await createPendingListing();
    const second = await createPendingListing();
    const approved = await createPendingListing();
    await approve(approved).expect(200);

    const { body } = await getPending().expect(200);

    expect(listedIds(body)).toEqual([first, second]);
    expect(body.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
  });

  it("returns the seller and the car", async () => {
    await createPendingListing();

    const { body } = await getPending().expect(200);

    expect(body.listings[0]).toMatchObject({
      status: "pending",
      user: { firstName: "John", imageUrl: expect.any(String) },
      car: { price: carPayload.price, make: { name: expect.any(String) } },
    });
    expect(body.listings[0].user).not.toHaveProperty("imageName");
  });

  it("pages through the queue", async () => {
    const first = await createPendingListing();
    const second = await createPendingListing();

    const page2 = await getPending("?limit=1&page=2").expect(200);

    expect(listedIds(page2.body)).toEqual([second]);
    expect(listedIds(page2.body)).not.toContain(first);
    expect(page2.body.meta).toMatchObject({ total: 2, totalPages: 2 });
  });
});

describe("PATCH /api/listings/:id/reject", () => {
  it("is only for admins", async () => {
    const listingId = await createPendingListing();

    await request(app)
      .patch(`/api/listings/${listingId}/reject`)
      .send({ reason: "Blurry photos" })
      .expect(401);
    await request(app)
      .patch(`/api/listings/${listingId}/reject`)
      .send({ reason: "Blurry photos" })
      .auth(seller.accessToken, { type: "bearer" })
      .expect(403);
  });

  it("rejects a pending listing and takes it out of the queue", async () => {
    const listingId = await createPendingListing();

    const { body } = await reject(listingId, "  Blurry photos  ").expect(200);

    expect(body.listing).toMatchObject({
      id: listingId,
      status: "rejected",
      rejectionReason: "Blurry photos",
    });
    const queue = await getPending().expect(200);
    expect(listedIds(queue.body)).toEqual([]);
  });

  it("requires a reason", async () => {
    const listingId = await createPendingListing();

    const { body } = await request(app)
      .patch(`/api/listings/${listingId}/reject`)
      .send({})
      .auth(admin.accessToken, { type: "bearer" })
      .expect(400);

    expect(body.errors[0]).toMatchObject({
      code: "validation.required",
      field: "reason",
    });
  });

  it.each([[""], ["   "], [42], ["x".repeat(1001)]])(
    "requires a valid reason (%j)",
    async (reason) => {
      const listingId = await createPendingListing();

      const { body } = await reject(listingId, reason).expect(400);

      expect(body.errors[0].field).toBe("reason");
    },
  );

  it("refuses a listing that is not pending", async () => {
    const draft = await createListing();
    const approved = await createPendingListing();
    await approve(approved).expect(200);

    for (const listingId of [draft, approved]) {
      const { body } = await reject(listingId).expect(400);
      expect(body.errors[0].code).toBe("listing.not_pending");
    }
  });

  it("answers 404 for an unknown listing", async () => {
    const { body } = await reject(999999).expect(404);

    expect(body.errors[0].code).toBe("listing.not_found");
  });

  it("shows the reason to the seller until the listing is edited", async () => {
    const listingId = await createPendingListing();
    await reject(listingId).expect(200);

    const rejected = await request(app)
      .get("/api/listings/mine")
      .auth(seller.accessToken, { type: "bearer" })
      .expect(200);
    expect(rejected.body.listings[0]).toMatchObject({
      status: "rejected",
      rejectionReason: "Blurry photos",
    });

    await request(app)
      .patch(`/api/listings/${listingId}`)
      .send({ title: "A black car, new photos" })
      .auth(seller.accessToken, { type: "bearer" })
      .expect(200);

    const edited = await request(app)
      .get("/api/listings/mine")
      .auth(seller.accessToken, { type: "bearer" })
      .expect(200);
    expect(edited.body.listings[0]).toMatchObject({
      status: "pending",
      rejectionReason: null,
    });
  });

  it("clears the reason when an admin approves the listing later", async () => {
    const listingId = await createPendingListing();
    await reject(listingId).expect(200);

    const { body } = await approve(listingId).expect(200);

    expect(body.updatedRows[0]).toMatchObject({
      status: "approved",
      rejectionReason: null,
    });
  });
});

describe("GET /api/listings/:id visibility", () => {
  const getDetails = (listingId: number, token?: string) => {
    const call = request(app).get(`/api/listings/${listingId}`);
    return token ? call.auth(token, { type: "bearer" }) : call;
  };

  it("shows an approved listing to everyone", async () => {
    const listingId = await createPendingListing();
    await approve(listingId).expect(200);

    const { body } = await getDetails(listingId).expect(200);

    expect(body.listing.id).toBe(listingId);
    expect(body.listing).not.toHaveProperty("userId");
  });

  it("hides other statuses from visitors and other users", async () => {
    const buyer = await signupOther("buyer");
    const otherSeller = await signupOther("seller");
    const draft = await createListing();
    const pending = await createPendingListing();
    const rejected = await createPendingListing();
    await reject(rejected).expect(200);

    for (const listingId of [draft, pending, rejected]) {
      for (const token of [
        undefined,
        buyer.accessToken,
        otherSeller.accessToken,
      ]) {
        const { body } = await getDetails(listingId, token).expect(404);
        expect(body.errors[0].code).toBe("listing.not_found");
      }
    }
  });

  it("shows every status to the seller, with the rejection reason", async () => {
    const draft = await createListing();
    const rejected = await createPendingListing();
    await reject(rejected).expect(200);

    await getDetails(draft, seller.accessToken).expect(200);
    const { body } = await getDetails(rejected, seller.accessToken).expect(200);

    expect(body.listing.rejectionReason).toBe("Blurry photos");
  });

  it("shows every status to admins", async () => {
    const pending = await createPendingListing();

    await getDetails(pending, admin.accessToken).expect(200);
  });
});

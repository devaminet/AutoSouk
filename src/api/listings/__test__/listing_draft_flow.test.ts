import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { carTable } from "../../../db/schema/car";
import { carMediaTable } from "../../../db/schema/car_media";
import { inspectionTable } from "../../../db/schema/inspection";
import { listingTable } from "../../../db/schema/listing";
import { minioClient } from "../../../file_storage/minio";
import { carBucketName } from "../../../utils/constants";
import { createBucket, getFileType } from "../../../utils/functions";
import {
  createBuyer,
  createMechanic,
} from "../../inspections/__test__/fixtures";
import {
  addUploadedCarImages,
  getListingDetailsAsAdmin,
  signinUser,
  signupUserWithVerification,
  submitWithImages,
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

type AddedMedia = { id: number; filename: string };
type VisibleMedia = { id: number; type: string; isPrimary: boolean };

let seller: Awaited<ReturnType<typeof signinUser>>;

const asSeller = (req: request.Test, token = seller.accessToken) =>
  req.auth(token, { type: "bearer" });

const createDraft = async () => {
  const response = await asSeller(
    request(app)
      .post("/api/listings")
      .send({ title: "A black car", description: "A brand new black Ford" }),
  ).expect(201);
  return response.body.listing.id as number;
};

const attachCar = async (listingId: number) => {
  const response = await asSeller(
    request(app).post(`/api/listings/${listingId}/car`).send(carPayload),
  ).expect(201);
  return response.body;
};

const createDraftWithCar = async () => {
  const listingId = await createDraft();
  const car = await attachCar(listingId);
  return { listingId, carId: car.id as number };
};

const addFiles = async (listingId: number, names: string[]) => {
  const response = await asSeller(
    request(app)
      .post(`/api/listings/${listingId}/media`)
      .send({ files: names.map((name) => ({ name })) }),
  ).expect(201);
  return response.body.carMedia as AddedMedia[];
};

const putImage = (filename: string) =>
  minioClient.putObject(carBucketName, filename, Buffer.from("img"), 3, {
    "Content-Type": "image/png",
  });

const putVideo = (filename: string) =>
  minioClient.putObject(carBucketName, filename, Buffer.from("vid"), 3, {
    "Content-Type": "video/mp4",
  });

const confirm = (listingId: number) =>
  asSeller(request(app).post(`/api/listings/${listingId}/media/confirm`));

const submit = (listingId: number, token = seller.accessToken) =>
  asSeller(request(app).post(`/api/listings/${listingId}/submit`), token);

const deleteMedia = (listingId: number, mediaIds: number[]) =>
  asSeller(
    request(app).delete(`/api/listings/${listingId}/media`).send({ mediaIds }),
  );

const signinAdmin = () =>
  signinUser({ email: "admin@autosouk.com", password: "Admin_@@789" });

const approve = async (listingId: number) => {
  const admin = await signinAdmin();
  return await request(app)
    .patch(`/api/listings/${listingId}/approve`)
    .auth(admin.accessToken, { type: "bearer" });
};

const details = async (listingId: number) =>
  (await getListingDetailsAsAdmin(listingId)).body.listing;

const uploadAndConfirm = async (listingId: number, names: string[]) => {
  const added = await addFiles(listingId, names);
  for (const { filename } of added) {
    await putImage(filename);
  }
  await confirm(listingId).expect(200);
  return added;
};

const createApprovedListing = async () => {
  const { listingId, carId } = await createDraftWithCar();
  await submitWithImages(listingId, seller.accessToken);
  expect((await approve(listingId)).statusCode).toBe(200);
  return { listingId, carId };
};

const setPrimaryFlags = (mediaId: number, isPrimary: boolean) =>
  db
    .update(carMediaTable)
    .set({ isPrimary })
    .where(eq(carMediaTable.id, mediaId));

beforeAll(async () => {
  await createBucket(carBucketName);
});

beforeEach(async () => {
  await signupUserWithVerification({ userType: "seller" });
  seller = await signinUser();
});

describe("POST /api/listings/:id/car", () => {
  it("keeps the listing a draft and returns the car without media", async () => {
    const listingId = await createDraft();

    const car = await attachCar(listingId);

    expect(car).toMatchObject({ listingId, equipmentIds: [] });
    expect(car.carMedia).toBeUndefined();
    expect((await details(listingId)).status).toBe("draft");
  });

  it("ignores files sent in the old request shape", async () => {
    const listingId = await createDraft();

    const { body } = await asSeller(
      request(app)
        .post(`/api/listings/${listingId}/car`)
        .send({ ...carPayload, files: [{ name: "a.png", isPrimary: true }] }),
    ).expect(201);

    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, body.id));
    expect(rows).toEqual([]);
  });
});

describe("the status rule for seller edits", () => {
  const editTitle = (listingId: number) =>
    asSeller(
      request(app)
        .patch(`/api/listings/${listingId}`)
        .send({ title: "New title" }),
    );

  it("keeps a draft a draft on PATCH, with or without a car", async () => {
    const withoutCar = await createDraft();
    const { body } = await editTitle(withoutCar).expect(200);
    expect(body.listing).toMatchObject({ status: "draft", title: "New title" });

    const { listingId } = await createDraftWithCar();
    const updated = await asSeller(
      request(app)
        .patch(`/api/listings/${listingId}`)
        .send({ car: { price: 1000 } }),
    ).expect(200);
    expect(updated.body.listing.status).toBe("draft");
    expect((await details(listingId)).car.price).toBe(1000);
  });

  it("sends an approved listing back to pending on PATCH", async () => {
    const { listingId } = await createApprovedListing();

    const { body } = await editTitle(listingId).expect(200);

    expect(body.listing).toMatchObject({
      status: "pending",
      approvedAt: null,
      rejectionReason: null,
    });
  });

  it("clears the rejection of a rejected listing on PATCH", async () => {
    const { listingId } = await createDraftWithCar();
    await submitWithImages(listingId, seller.accessToken);
    const admin = await signinAdmin();
    await request(app)
      .patch(`/api/listings/${listingId}/reject`)
      .send({ reason: "Blurry photos" })
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    const { body } = await editTitle(listingId).expect(200);

    expect(body.listing).toMatchObject({
      status: "pending",
      rejectionReason: null,
    });
  });

  it("keeps a draft a draft on confirm", async () => {
    const { listingId } = await createDraftWithCar();

    await uploadAndConfirm(listingId, ["a.png"]);

    expect((await details(listingId)).status).toBe("draft");
  });

  it("sends an approved listing back to pending on confirm", async () => {
    const { listingId } = await createApprovedListing();

    await uploadAndConfirm(listingId, ["a.png"]);

    const listing = await details(listingId);
    expect(listing.status).toBe("pending");
    expect(listing.approvedAt).toBeNull();
  });
});

describe("POST /api/listings/:id/submit", () => {
  it("requires authentication", () => {
    return request(app).post("/api/listings/1/submit").expect(401);
  });

  it("requires a seller", async () => {
    await signupUserWithVerification({
      userType: "buyer",
      email: "buyer@example.com",
    });
    const buyer = await signinUser({ email: "buyer@example.com" });

    await submit(1, buyer.accessToken).expect(403);
  });

  it("returns 404 for a listing of another seller", async () => {
    const { listingId } = await createDraftWithCar();
    await addUploadedCarImages(listingId);
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    const other = await signinUser({ email: "other@example.com" });

    const { body } = await submit(listingId, other.accessToken).expect(404);

    expect(body.errors[0].code).toBe("listing.not_found");
    expect((await details(listingId)).status).toBe("draft");
  });

  it("rejects an id that is not a positive whole number", async () => {
    const { body } = await submit(0).expect(400);

    expect(body.errors[0].field).toBe("id");
  });

  it("submits a complete draft", async () => {
    const { listingId } = await createDraftWithCar();
    await uploadAndConfirm(listingId, ["a.png", "b.png", "c.png"]);

    const { body } = await submit(listingId).expect(200);

    expect(body.listing).toMatchObject({
      id: listingId,
      status: "pending",
      approvedAt: null,
      rejectionReason: null,
    });
    const pending = await request(app)
      .get("/api/listings/pending")
      .auth((await signinAdmin()).accessToken, { type: "bearer" })
      .expect(200);
    expect(pending.body.listings.map(({ id }: { id: number }) => id)).toEqual([
      listingId,
    ]);
  });

  it("refuses a listing that is not a draft", async () => {
    const { listingId } = await createDraftWithCar();
    await submitWithImages(listingId, seller.accessToken);

    const { body } = await submit(listingId).expect(400);

    expect(body.errors[0]).toMatchObject({
      code: "listing.not_draft",
      message: "This listing is not a draft",
    });
  });

  it("refuses a draft without a car", async () => {
    const listingId = await createDraft();

    const { body } = await submit(listingId).expect(400);

    expect(body.errors[0].code).toBe("listing.car_required");
  });

  it("refuses fewer than 3 uploaded images", async () => {
    const { listingId } = await createDraftWithCar();
    await uploadAndConfirm(listingId, ["a.png", "b.png"]);

    const { body } = await submit(listingId).expect(400);

    expect(body.errors[0]).toMatchObject({
      code: "media.min_images",
      params: { count: 3 },
    });
    expect((await details(listingId)).status).toBe("draft");
  });

  it("does not count videos or files not uploaded yet towards the minimum", async () => {
    const { listingId } = await createDraftWithCar();
    await uploadAndConfirm(listingId, ["a.png", "b.png"]);
    const [video] = await addFiles(listingId, ["walk.mp4"]);
    await putVideo(video.filename);
    await confirm(listingId).expect(200);
    await addFiles(listingId, ["never-uploaded.png"]);

    const { body } = await submit(listingId).expect(400);

    expect(body.errors[0].code).toBe("media.min_images");
  });

  it("does not let files not uploaded yet block it, and keeps them hidden", async () => {
    const { listingId } = await createDraftWithCar();
    await uploadAndConfirm(listingId, ["a.png", "b.png", "c.png"]);
    await addFiles(listingId, ["stuck.png"]);

    await submit(listingId).expect(200);

    expect((await details(listingId)).car.carMedias).toHaveLength(3);
  });

  it("refuses a car whose primary media is not an uploaded image", async () => {
    const { listingId } = await createDraftWithCar();
    const added = await uploadAndConfirm(listingId, [
      "a.png",
      "b.png",
      "c.png",
    ]);
    await setPrimaryFlags(added[0].id, false);

    const { body } = await submit(listingId).expect(400);

    expect(body.errors[0]).toMatchObject({
      code: "media.primary_required",
      message: "Choose an uploaded image as the cover before submitting",
    });
  });
});

describe("primary media", () => {
  it("is not set when files are added", async () => {
    const { listingId, carId } = await createDraftWithCar();

    await addFiles(listingId, ["a.png", "b.png"]);

    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(rows.map(({ isPrimary }) => isPrimary)).toEqual([false, false]);
  });

  it("is set on confirm to the oldest uploaded image", async () => {
    const { listingId } = await createDraftWithCar();
    const [neverUploaded, first, second] = await addFiles(listingId, [
      "a.png",
      "b.png",
      "c.png",
    ]);
    expect(neverUploaded.id).toBeLessThan(first.id);
    await putImage(second.filename);
    await putImage(first.filename);

    await confirm(listingId).expect(200);

    const media: VisibleMedia[] = (await details(listingId)).car.carMedias;
    expect(media.map(({ id, isPrimary }) => [id, isPrimary])).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
  });

  it("is never a video", async () => {
    const { listingId } = await createDraftWithCar();
    const [video] = await addFiles(listingId, ["walk.mp4"]);
    await putVideo(video.filename);

    await confirm(listingId).expect(200);
    const [onlyVideo]: VisibleMedia[] = (await details(listingId)).car
      .carMedias;
    expect(onlyVideo.isPrimary).toBe(false);

    const [image] = await uploadAndConfirm(listingId, ["a.png"]);
    const media: VisibleMedia[] = (await details(listingId)).car.carMedias;
    expect(media[0]).toMatchObject({ id: image.id, isPrimary: true });
  });

  it("keeps a primary the seller chose", async () => {
    const { listingId } = await createDraftWithCar();
    const added = await uploadAndConfirm(listingId, ["a.png", "b.png"]);
    await asSeller(
      request(app).patch(
        `/api/listings/${listingId}/media/${added[1].id}/primary`,
      ),
    ).expect(200);

    await uploadAndConfirm(listingId, ["c.png"]);

    const media: VisibleMedia[] = (await details(listingId)).car.carMedias;
    expect(media.filter(({ isPrimary }) => isPrimary)).toEqual([
      expect.objectContaining({ id: added[1].id }),
    ]);
  });

  it("moves from a file that was never uploaded to an uploaded image", async () => {
    const { listingId, carId } = await createDraftWithCar();
    const [stuck, uploaded] = await addFiles(listingId, ["a.png", "b.png"]);
    await setPrimaryFlags(stuck.id, true);
    await putImage(uploaded.filename);

    await confirm(listingId).expect(200);

    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(
      rows.filter(({ isPrimary }) => isPrimary).map(({ id }) => id),
    ).toEqual([uploaded.id]);
  });

  it("is not given to a file that is not uploaded when the primary is deleted", async () => {
    const { listingId, carId } = await createDraftWithCar();
    const [primary] = await uploadAndConfirm(listingId, ["a.png"]);
    await addFiles(listingId, ["stuck.png"]);

    await deleteMedia(listingId, [primary.id]).expect(200);

    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(rows.map(({ isPrimary }) => isPrimary)).toEqual([false]);
  });
});

describe("recovering interrupted uploads", () => {
  it("returns the media id in pending, which can then be deleted", async () => {
    const { listingId, carId } = await createDraftWithCar();
    const [stuck] = await addFiles(listingId, ["stuck.png"]);

    const { body } = await confirm(listingId).expect(200);

    expect(body.pending).toEqual([
      {
        id: stuck.id,
        filename: stuck.filename,
        upload: expect.objectContaining({ url: expect.any(String) }),
      },
    ]);

    await deleteMedia(listingId, [body.pending[0].id]).expect(200);
    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(rows).toEqual([]);
  });

  it("deletes a stuck file on a listing below the minimum outside a draft", async () => {
    const { listingId, carId } = await createDraftWithCar();
    await uploadAndConfirm(listingId, ["a.png"]);
    const [stuck] = await addFiles(listingId, ["stuck.png"]);
    await db
      .update(listingTable)
      .set({ status: "pending" })
      .where(eq(listingTable.id, listingId));

    await deleteMedia(listingId, [stuck.id]).expect(200);

    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(rows).toHaveLength(1);
  });
});

describe("the minimum images rule on delete", () => {
  it("does not block a draft", async () => {
    const { listingId } = await createDraftWithCar();
    const added = await uploadAndConfirm(listingId, [
      "a.png",
      "b.png",
      "c.png",
    ]);

    const { body } = await deleteMedia(
      listingId,
      added.map(({ id }) => id),
    ).expect(200);

    expect(body.carMedias).toEqual([]);
    expect((await details(listingId)).status).toBe("draft");
  });

  it("refuses on an approved listing", async () => {
    const { listingId } = await createApprovedListing();
    const [{ id }]: VisibleMedia[] = (await details(listingId)).car.carMedias;

    const { body } = await deleteMedia(listingId, [id]).expect(400);

    expect(body.errors[0].code).toBe("media.min_images");
    expect((await details(listingId)).car.carMedias).toHaveLength(3);
  });
});

describe("PATCH /api/listings/:id/approve", () => {
  it("refuses a draft, even a complete one", async () => {
    const { listingId } = await createDraftWithCar();
    await addUploadedCarImages(listingId);

    const response = await approve(listingId);

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].code).toBe("listing.not_pending");
    expect((await details(listingId)).status).toBe("draft");
  });

  it("refuses a pending listing with too few images", async () => {
    const { listingId } = await createDraftWithCar();
    await addUploadedCarImages(listingId, 2);
    await db
      .update(listingTable)
      .set({ status: "pending" })
      .where(eq(listingTable.id, listingId));

    const response = await approve(listingId);

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0]).toMatchObject({
      code: "media.min_images",
      params: { count: 3 },
    });
    expect((await details(listingId)).status).toBe("pending");
  });

  it("refuses a pending listing without a car", async () => {
    const listingId = await createDraft();
    await db
      .update(listingTable)
      .set({ status: "pending" })
      .where(eq(listingTable.id, listingId));

    const response = await approve(listingId);

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].code).toBe("listing.car_required");
  });

  it("keeps the code for an approved listing", async () => {
    const { listingId } = await createApprovedListing();

    const response = await approve(listingId);

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].code).toBe("listing.already_approved");
  });

  it("approves a complete pending listing", async () => {
    const { listingId } = await createDraftWithCar();
    await submitWithImages(listingId, seller.accessToken);

    const response = await approve(listingId);

    expect(response.statusCode).toBe(200);
    expect(response.body.updatedRows).toEqual([
      expect.objectContaining({ id: listingId, status: "approved" }),
    ]);
  });
});

describe("file extensions", () => {
  it.each([
    ["IMG_001.JPG", "image"],
    ["photo.JpEg", "image"],
    ["WALK.MP4", "video"],
    ["notes.TXT", null],
  ])("reads %s as %s", (name, type) => {
    expect(getFileType(name)).toBe(type);
  });

  it("accepts IMG_001.JPG and stores it with a lowercase extension", async () => {
    const { listingId, carId } = await createDraftWithCar();

    const [media] = await addFiles(listingId, ["IMG_001.JPG"]);

    expect(media.filename).toMatch(/^car-[a-f0-9]+\.jpg$/);
    const [row] = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(row.type).toBe("image");
  });

  it("accepts an uppercase extension for profile images", async () => {
    const response = await asSeller(
      request(app)
        .post("/api/auth/profile-image")
        .send({ imageName: "ME.JPG" }),
    );

    expect(response.statusCode).toBeLessThan(400);
  });
});

describe("GET /api/listings/mine", () => {
  const getMine = (query = "") =>
    asSeller(request(app).get(`/api/listings/mine${query}`));

  it("counts every status and ignores the status filter", async () => {
    await createDraft();
    await createDraft();
    const { listingId } = await createDraftWithCar();
    await submitWithImages(listingId, seller.accessToken);

    const { body } = await getMine("?status=pending").expect(200);

    expect(body.listings).toHaveLength(1);
    expect(body.meta.total).toBe(1);
    expect(body.meta.statusCounts).toEqual({
      draft: 2,
      pending: 1,
      approved: 0,
      withdrawn: 0,
      rejected: 0,
      sold: 0,
    });
  });

  it("does not count other sellers' listings", async () => {
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    const other = await signinUser({ email: "other@example.com" });
    await asSeller(
      request(app)
        .post("/api/listings")
        .send({ title: "Theirs", description: "Theirs" }),
      other.accessToken,
    ).expect(201);

    const { body } = await getMine().expect(200);

    expect(body.meta.statusCounts.draft).toBe(0);
  });

  it("returns the distance in the car summary", async () => {
    await createDraftWithCar();

    const { body } = await getMine().expect(200);

    expect(body.listings[0].car.distance).toBe(carPayload.distance);
  });

  it("counts only completed inspections, per listing", async () => {
    const withoutCar = await createDraft();
    const inspected = await createDraftWithCar();
    const notInspected = await createDraftWithCar();
    const { mechanic } = await createMechanic("mechanic@example.com");
    const buyer = await createBuyer("buyer@example.com");
    const inspection = (status: "completed" | "pending") => ({
      carId: inspected.carId,
      buyerId: buyer.user.id,
      mechanicId: mechanic.id,
      status,
      priceAtRequest: 300,
    });
    await db
      .insert(inspectionTable)
      .values([
        inspection("completed"),
        inspection("completed"),
        inspection("pending"),
      ]);

    const { body } = await getMine().expect(200);

    const counts = new Map(
      body.listings.map(
        (listing: { id: number; completedInspectionsCount: number }) => [
          listing.id,
          listing.completedInspectionsCount,
        ],
      ),
    );
    expect(counts.get(withoutCar)).toBe(0);
    expect(counts.get(inspected.listingId)).toBe(2);
    expect(counts.get(notInspected.listingId)).toBe(0);
  });
});

describe("car-less listings", () => {
  const setStatus = (
    listingId: number,
    status: "pending" | "approved" | "rejected",
  ) =>
    db
      .update(listingTable)
      .set({ status })
      .where(eq(listingTable.id, listingId));

  const attach = (listingId: number) =>
    asSeller(
      request(app).post(`/api/listings/${listingId}/car`).send(carPayload),
    );

  const deleteListing = (listingId: number, token = seller.accessToken) =>
    asSeller(request(app).delete(`/api/listings/${listingId}`), token);

  const getDetails = (listingId: number, token?: string) => {
    const req = request(app).get(`/api/listings/${listingId}`);
    return token ? req.auth(token, { type: "bearer" }) : req;
  };

  const signinOtherSeller = async () => {
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    return await signinUser({ email: "other@example.com" });
  };

  describe("POST /api/listings/:id/car on a non-draft listing", () => {
    it.each(["pending", "approved", "rejected"] as const)(
      "refuses a %s listing without a car, and saves nothing",
      async (status) => {
        const listingId = await createDraft();
        await setStatus(listingId, status);

        const { body } = await attach(listingId).expect(400);

        expect(body.errors[0]).toMatchObject({
          code: "listing.not_draft",
          message: "This listing is not a draft",
        });
        expect(
          await db
            .select()
            .from(carTable)
            .where(eq(carTable.listingId, listingId)),
        ).toEqual([]);
      },
    );

    it.each(["pending", "approved", "rejected"] as const)(
      "answers not_draft before car_already_attached on a %s listing",
      async (status) => {
        const { listingId } = await createDraftWithCar();
        await setStatus(listingId, status);

        const { body } = await attach(listingId).expect(400);

        expect(body.errors[0].code).toBe("listing.not_draft");
      },
    );

    it("still answers car_already_attached on a draft", async () => {
      const { listingId } = await createDraftWithCar();

      const { body } = await attach(listingId).expect(400);

      expect(body.errors[0].code).toBe("listing.car_already_attached");
    });
  });

  describe("DELETE /api/listings/:id", () => {
    it("deletes a draft without a car", async () => {
      const listingId = await createDraft();

      const { body } = await deleteListing(listingId).expect(200);

      expect(body).toEqual({ deleted: true, listingId });
      await getDetails(listingId, seller.accessToken).expect(404);
      const mine = await asSeller(
        request(app).get("/api/listings/mine"),
      ).expect(200);
      expect(mine.body.listings).toEqual([]);
    });

    it.each(["pending", "approved", "rejected"] as const)(
      "deletes a %s listing without a car",
      async (status) => {
        const listingId = await createDraft();
        await setStatus(listingId, status);

        await deleteListing(listingId).expect(200);

        await getDetails(listingId, seller.accessToken).expect(404);
      },
    );

    it("deletes a listing with its car and media", async () => {
      const { listingId, carId } = await createDraftWithCar();
      await addUploadedCarImages(listingId);
      await addFiles(listingId, ["stuck.png"]);

      await deleteListing(listingId).expect(200);

      await getDetails(listingId, seller.accessToken).expect(404);
      expect(
        await db.select().from(carTable).where(eq(carTable.id, carId)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(carMediaTable)
          .where(eq(carMediaTable.carId, carId)),
      ).toEqual([]);
    });

    it("returns 404 for a car-less listing of another seller, and keeps it", async () => {
      const listingId = await createDraft();
      const other = await signinOtherSeller();

      await deleteListing(listingId, other.accessToken).expect(404);

      await getDetails(listingId, seller.accessToken).expect(200);
    });

    it("returns 404 for a listing that does not exist", async () => {
      await deleteListing(99999).expect(404);
    });
  });

  describe("reading a draft without a car", () => {
    it("appears in GET /api/listings/mine with car null", async () => {
      const listingId = await createDraft();

      const { body } = await asSeller(
        request(app).get("/api/listings/mine"),
      ).expect(200);

      expect(body.listings).toEqual([
        expect.objectContaining({
          id: listingId,
          status: "draft",
          car: null,
          completedInspectionsCount: 0,
        }),
      ]);
    });

    it("appears in GET /api/listings/:id with car null for its seller and admins", async () => {
      const listingId = await createDraft();
      const admin = await signinAdmin();

      for (const token of [seller.accessToken, admin.accessToken]) {
        const { body } = await getDetails(listingId, token).expect(200);
        expect(body.listing).toMatchObject({
          id: listingId,
          status: "draft",
          car: null,
        });
      }
    });

    it("stays hidden from visitors and other sellers", async () => {
      const listingId = await createDraft();
      const other = await signinOtherSeller();

      await getDetails(listingId).expect(404);
      await getDetails(listingId, other.accessToken).expect(404);
    });
  });
});

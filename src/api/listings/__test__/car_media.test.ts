import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { carMediaTable } from "../../../db/schema/car_media";
import { minioClient } from "../../../file_storage/minio";
import { carBucketName } from "../../../utils/constants";
import { createBucket } from "../../../utils/functions";
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

type AddedMedia = {
  id: number;
  filename: string;
  originalName: string;
  upload: { url: string; fields: Record<string, string> };
};

const namedFiles = (count: number, prefix = "extra") =>
  Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${index + 1}.png`,
  }));

const createListing = async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });
  return { authUser, listingId: created.body.listing.id as number };
};

const createListingWithCar = async () => {
  const { authUser, listingId } = await createListing();
  const attached = await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(201);
  return { authUser, listingId, carId: attached.body.id as number };
};

const addMedia = (listingId: number, accessToken: string, body: unknown) =>
  request(app)
    .post(`/api/listings/${listingId}/media`)
    .send(body as object)
    .auth(accessToken, { type: "bearer" });

const countCarMedia = async (carId: number) =>
  (await db.select().from(carMediaTable).where(eq(carMediaTable.carId, carId)))
    .length;

const uploadImage = (filename: string) =>
  minioClient.putObject(carBucketName, filename, Buffer.from("img"), 3, {
    "Content-Type": "image/png",
  });

beforeAll(async () => {
  await createBucket(carBucketName);
});

describe("POST /api/listings/:id/media", () => {
  it("requires authentication", () => {
    return request(app).post("/api/listings/1/media").expect(401);
  });

  it("requires a seller", async () => {
    await signupUserWithVerification({ userType: "buyer" });
    const buyer = await signinUser();

    await addMedia(1, buyer.accessToken, { files: namedFiles(1) }).expect(403);
  });

  it("returns 404 for a listing of another seller", async () => {
    const { listingId } = await createListingWithCar();
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    const other = await signinUser({
      email: "other@example.com",
      password: "USEr_@@852852",
    });

    await addMedia(listingId, other.accessToken, {
      files: namedFiles(1),
    }).expect(404);
  });

  it("returns 400 when no car is attached", async () => {
    const { authUser, listingId } = await createListing();

    const response = await addMedia(listingId, authUser.accessToken, {
      files: namedFiles(1),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].message).toBe(
      "Attach a car to this listing before adding media",
    );
  });

  it("returns upload policies for media that stays hidden until confirmed", async () => {
    const { authUser, listingId, carId } = await createListingWithCar();

    const response = await addMedia(listingId, authUser.accessToken, {
      files: [{ name: "side.png" }, { name: "walkaround.mp4" }],
    });

    expect(response.statusCode).toBe(201);
    const carMedia: AddedMedia[] = response.body.carMedia;
    expect(carMedia.map(({ originalName }) => originalName)).toEqual([
      "side.png",
      "walkaround.mp4",
    ]);
    expect(carMedia[0]).toEqual({
      id: expect.any(Number),
      filename: expect.stringMatching(/^car-[a-f0-9]+\.png$/),
      originalName: "side.png",
      upload: {
        url: expect.stringContaining("/cars"),
        fields: expect.objectContaining({ key: carMedia[0].filename }),
      },
    });

    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    expect(rows.filter((row) => row.id === carMedia[1].id)).toEqual([
      expect.objectContaining({
        type: "video",
        isPrimary: false,
        isUploaded: false,
      }),
    ]);
  });

  it.each([
    [{}, "At least one file is required."],
    [{ files: [] }, "At least one file is required."],
    [
      { files: [{ name: "a.png" }, { name: "A.png" }] },
      "File names must be unique.",
    ],
  ])("rejects an invalid body %j", async (body, message) => {
    const { authUser, listingId } = await createListingWithCar();

    const response = await addMedia(listingId, authUser.accessToken, body);

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].message).toBe(message);
  });

  it("rejects unsupported file types", async () => {
    const { authUser, listingId } = await createListingWithCar();

    const response = await addMedia(listingId, authUser.accessToken, {
      files: [{ name: "notes.txt" }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].field).toBe("files.0.name");
  });

  it("allows up to 20 files per car, counting pending uploads", async () => {
    const { authUser, listingId, carId } = await createListingWithCar();

    await addMedia(listingId, authUser.accessToken, {
      files: namedFiles(17),
    }).expect(201);
    const response = await addMedia(listingId, authUser.accessToken, {
      files: namedFiles(1, "one-more"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { message: "A car can have at most 20 files.", field: "files" },
    ]);
    expect(await countCarMedia(carId)).toBe(20);
  });

  it("keeps the limit when media is added concurrently", async () => {
    const { authUser, listingId, carId } = await createListingWithCar();

    const responses = await Promise.all([
      addMedia(listingId, authUser.accessToken, {
        files: namedFiles(10, "first"),
      }),
      addMedia(listingId, authUser.accessToken, {
        files: namedFiles(10, "second"),
      }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 400,
    ]);
    expect(await countCarMedia(carId)).toBe(13);
  });
});

describe("confirming added media", () => {
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

  const confirm = (listingId: number, accessToken: string) =>
    request(app)
      .post(`/api/listings/${listingId}/media/confirm`)
      .auth(accessToken, { type: "bearer" })
      .expect(200);

  const listingStatus = async (listingId: number) => {
    const details = await request(app).get(`/api/listings/${listingId}`);
    return details.body.listing.status as string;
  };

  it("sends an approved listing back to pending once new media is uploaded", async () => {
    const { authUser, listingId } = await createListingWithCar();
    await approve(listingId);
    const added = await addMedia(listingId, authUser.accessToken, {
      files: [{ name: "side.png" }],
    }).expect(201);
    const [media]: AddedMedia[] = added.body.carMedia;

    await uploadImage(media.filename);
    const confirmed = await confirm(listingId, authUser.accessToken);

    expect(confirmed.body.uploaded).toContain(media.filename);
    expect(await listingStatus(listingId)).toBe("pending");
  });

  it("keeps the listing approved while the new media is not uploaded", async () => {
    const { authUser, listingId } = await createListingWithCar();
    await approve(listingId);
    await addMedia(listingId, authUser.accessToken, {
      files: [{ name: "side.png" }],
    }).expect(201);

    await confirm(listingId, authUser.accessToken);

    expect(await listingStatus(listingId)).toBe("approved");
  });
});

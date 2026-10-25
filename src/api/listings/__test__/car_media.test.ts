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

type DetailsMedia = { id: number; link: string; isPrimary: boolean };

// Attaches a car with the 3 required images plus `extra` more, uploads
// and confirms all of them, and returns the visible media primary first.
const createCarWithUploadedImages = async (extra = 0) => {
  const { authUser, listingId, carId } = await createListingWithCar();
  if (extra > 0) {
    await addMedia(listingId, authUser.accessToken, {
      files: namedFiles(extra),
    }).expect(201);
  }
  const rows = await db
    .select()
    .from(carMediaTable)
    .where(eq(carMediaTable.carId, carId));
  for (const row of rows) {
    await uploadImage(row.link);
  }
  await request(app)
    .post(`/api/listings/${listingId}/media/confirm`)
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(200);
  return { authUser, listingId, carId, media: await visibleMedia(listingId) };
};

const visibleMedia = async (listingId: number) => {
  const details = await request(app).get(`/api/listings/${listingId}`);
  return details.body.listing.car.carMedias as DetailsMedia[];
};

describe("DELETE /api/listings/:id/media", () => {
  const filenameOf = async (mediaId: number) => {
    const [row] = await db
      .select({ link: carMediaTable.link })
      .from(carMediaTable)
      .where(eq(carMediaTable.id, mediaId));
    return row.link;
  };

  const objectExists = async (filename: string) => {
    try {
      await minioClient.statObject(carBucketName, filename);
      return true;
    } catch {
      return false;
    }
  };

  const deleteMedia = (listingId: number, accessToken: string, body: unknown) =>
    request(app)
      .delete(`/api/listings/${listingId}/media`)
      .send(body as object)
      .auth(accessToken, { type: "bearer" });

  it("requires authentication", () => {
    return request(app).delete("/api/listings/1/media").expect(401);
  });

  it("returns 404 for a listing of another seller", async () => {
    const { listingId, media } = await createCarWithUploadedImages(1);
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    const other = await signinUser({
      email: "other@example.com",
      password: "USEr_@@852852",
    });

    await deleteMedia(listingId, other.accessToken, {
      mediaIds: [media[1].id],
    }).expect(404);
  });

  it("returns 400 when no car is attached", async () => {
    const { authUser, listingId } = await createListing();

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [1],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].message).toBe(
      "Attach a car to this listing before editing it",
    );
  });

  it.each([
    [{}, "At least one media id is required."],
    [{ mediaIds: [] }, "At least one media id is required."],
    [{ mediaIds: [4, 4] }, "Media ids must be unique"],
  ])("rejects an invalid body %j", async (body, message) => {
    const { authUser, listingId } = await createListingWithCar();

    const response = await deleteMedia(listingId, authUser.accessToken, body);

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].message).toBe(message);
  });

  it("deletes media and its stored file while 3 images remain", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages(1);
    const target = media[3];
    const filename = await filenameOf(target.id);

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [target.id],
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.deleted).toEqual([target.id]);
    expect(response.body.carMedias.map(({ id }: DetailsMedia) => id)).toEqual(
      media.slice(0, 3).map(({ id }) => id),
    );
    expect(await objectExists(filename)).toBe(false);
    expect(await visibleMedia(listingId)).toHaveLength(3);
  });

  it("refuses to go below 3 uploaded images and keeps everything", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages(1);

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [media[2].id, media[3].id],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { message: "A car needs at least 3 images.", field: "mediaIds" },
    ]);
    expect(await visibleMedia(listingId)).toHaveLength(4);
    expect(await objectExists(await filenameOf(media[3].id))).toBe(true);
  });

  it("does not count images waiting for upload towards the minimum", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages();
    await addMedia(listingId, authUser.accessToken, {
      files: namedFiles(2, "pending"),
    }).expect(201);

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [media[2].id],
    });

    expect(response.statusCode).toBe(400);
  });

  it("always allows deleting media that is not uploaded yet", async () => {
    const { authUser, listingId, carId } = await createCarWithUploadedImages();
    const added = await addMedia(listingId, authUser.accessToken, {
      files: namedFiles(1, "pending"),
    }).expect(201);
    const [pending]: AddedMedia[] = added.body.carMedia;

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [pending.id],
    });

    expect(response.statusCode).toBe(200);
    expect(await countCarMedia(carId)).toBe(3);
  });

  it("returns 400 for media that does not belong to the car", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages(1);

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [media[3].id, 99999],
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { message: "Media 99999 does not exist for this car", field: "mediaIds" },
    ]);
    expect(await visibleMedia(listingId)).toHaveLength(4);
  });

  it("makes the oldest remaining image primary when the primary is deleted", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages(1);
    expect(media[0].isPrimary).toBe(true);

    const response = await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [media[0].id],
    });

    expect(response.statusCode).toBe(200);
    const remaining: DetailsMedia[] = response.body.carMedias;
    expect(remaining[0]).toMatchObject({ id: media[1].id, isPrimary: true });
    expect(remaining.filter(({ isPrimary }) => isPrimary)).toHaveLength(1);
  });

  it("does not send an approved listing back to approval", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages(1);
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    await request(app)
      .patch(`/api/listings/${listingId}/approve`)
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    await deleteMedia(listingId, authUser.accessToken, {
      mediaIds: [media[3].id],
    }).expect(200);

    const details = await request(app).get(`/api/listings/${listingId}`);
    expect(details.body.listing.status).toBe("approved");
  });

  it("keeps the minimum when media is deleted concurrently", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages(1);

    const responses = await Promise.all([
      deleteMedia(listingId, authUser.accessToken, {
        mediaIds: [media[2].id],
      }),
      deleteMedia(listingId, authUser.accessToken, {
        mediaIds: [media[3].id],
      }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 400,
    ]);
    expect(await visibleMedia(listingId)).toHaveLength(3);
  });

  it("gives the car a new primary when confirm rejects the primary upload", async () => {
    const { authUser, listingId, carId } = await createListingWithCar();
    const rows = await db
      .select()
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, carId));
    for (const row of rows) {
      if (row.isPrimary) {
        await minioClient.putObject(
          carBucketName,
          row.link,
          Buffer.from("text"),
          4,
          { "Content-Type": "text/plain" },
        );
      } else {
        await uploadImage(row.link);
      }
    }

    await request(app)
      .post(`/api/listings/${listingId}/media/confirm`)
      .auth(authUser.accessToken, { type: "bearer" })
      .expect(200);

    const media = await visibleMedia(listingId);
    expect(media).toHaveLength(2);
    expect(media[0].isPrimary).toBe(true);
  });
});

describe("PATCH /api/listings/:id/media/:mediaId/primary", () => {
  const setPrimary = (
    listingId: number,
    mediaId: number,
    accessToken: string,
  ) =>
    request(app)
      .patch(`/api/listings/${listingId}/media/${mediaId}/primary`)
      .auth(accessToken, { type: "bearer" });

  it("requires authentication", () => {
    return request(app).patch("/api/listings/1/media/1/primary").expect(401);
  });

  it("makes an uploaded image the only primary media", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages();

    const response = await setPrimary(
      listingId,
      media[2].id,
      authUser.accessToken,
    );

    expect(response.statusCode).toBe(200);
    const carMedias: DetailsMedia[] = response.body.carMedias;
    expect(carMedias.map(({ id, isPrimary }) => [id, isPrimary])).toEqual([
      [media[2].id, true],
      [media[0].id, false],
      [media[1].id, false],
    ]);
    expect((await visibleMedia(listingId))[0].id).toBe(media[2].id);
  });

  it("is idempotent for the current primary", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages();

    await setPrimary(listingId, media[0].id, authUser.accessToken).expect(200);

    const primaries = (await visibleMedia(listingId)).filter(
      ({ isPrimary }) => isPrimary,
    );
    expect(primaries.map(({ id }) => id)).toEqual([media[0].id]);
  });

  it("keeps an approved listing approved", async () => {
    const { authUser, listingId, media } = await createCarWithUploadedImages();
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    await request(app)
      .patch(`/api/listings/${listingId}/approve`)
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    await setPrimary(listingId, media[1].id, authUser.accessToken).expect(200);

    const details = await request(app).get(`/api/listings/${listingId}`);
    expect(details.body.listing.status).toBe("approved");
  });

  it("rejects a video", async () => {
    const { authUser, listingId } = await createCarWithUploadedImages();
    const added = await addMedia(listingId, authUser.accessToken, {
      files: [{ name: "walkaround.mp4" }],
    }).expect(201);
    const [video]: AddedMedia[] = added.body.carMedia;
    await minioClient.putObject(
      carBucketName,
      video.filename,
      Buffer.from("vid"),
      3,
      { "Content-Type": "video/mp4" },
    );
    await request(app)
      .post(`/api/listings/${listingId}/media/confirm`)
      .auth(authUser.accessToken, { type: "bearer" })
      .expect(200);

    const response = await setPrimary(
      listingId,
      video.id,
      authUser.accessToken,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].message).toBe(
      "Only an image can be the primary media",
    );
  });

  it("rejects an image that is not uploaded yet", async () => {
    const { authUser, listingId } = await createCarWithUploadedImages();
    const added = await addMedia(listingId, authUser.accessToken, {
      files: [{ name: "side.png" }],
    }).expect(201);
    const [pending]: AddedMedia[] = added.body.carMedia;

    const response = await setPrimary(
      listingId,
      pending.id,
      authUser.accessToken,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].message).toBe(
      "Upload and confirm this image before making it primary",
    );
  });

  it("returns 404 for media of another car", async () => {
    const { authUser, listingId } = await createCarWithUploadedImages();

    const response = await setPrimary(listingId, 99999, authUser.accessToken);

    expect(response.statusCode).toBe(404);
    expect(response.body.errors[0].message).toBe(
      "Media was not found for this car",
    );
  });

  it("returns 404 for a listing of another seller", async () => {
    const { listingId, media } = await createCarWithUploadedImages();
    await signupUserWithVerification({
      userType: "seller",
      email: "other@example.com",
    });
    const other = await signinUser({
      email: "other@example.com",
      password: "USEr_@@852852",
    });

    await setPrimary(listingId, media[1].id, other.accessToken).expect(404);
  });

  it("rejects ids that are not positive whole numbers", async () => {
    const { authUser, listingId } = await createCarWithUploadedImages();

    const response = await request(app)
      .patch(`/api/listings/${listingId}/media/abc/primary`)
      .auth(authUser.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].field).toBe("mediaId");
  });
});

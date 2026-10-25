import request from "supertest";
import { app } from "../../../app";
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

type CarMediaItem = { filename: string; originalName: string };

const createListingWithCar = async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });
  const listingId = created.body.listing.id;
  const attached = await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send(carPayload)
    .auth(authUser.accessToken, { type: "bearer" });
  return {
    authUser,
    listingId,
    carMedia: attached.body.carMedia as CarMediaItem[],
  };
};

const confirm = (listingId: number, accessToken: string) =>
  request(app)
    .post(`/api/listings/${listingId}/media/confirm`)
    .auth(accessToken, { type: "bearer" });

beforeAll(async () => {
  await createBucket(carBucketName);
});

it("should require authentication to confirm media", () => {
  return request(app).post("/api/listings/1/media/confirm").expect(401);
});

it("should not show media that was not uploaded yet", async () => {
  const { listingId } = await createListingWithCar();
  const details = await request(app).get(`/api/listings/${listingId}`);
  expect(details.body.listing.car.carMedias).toHaveLength(0);
});

it("should return new upload policies for media still missing", async () => {
  const { authUser, listingId, carMedia } = await createListingWithCar();
  const response = await confirm(listingId, authUser.accessToken);

  expect(response.statusCode).toBe(200);
  expect(response.body.uploaded).toHaveLength(0);
  expect(response.body.pending).toHaveLength(3);
  expect(
    response.body.pending.map((item: CarMediaItem) => item.filename).sort(),
  ).toEqual(carMedia.map((item) => item.filename).sort());
  expect(response.body.pending[0].upload.fields.policy).toBeDefined();
});

it("should show media once it is uploaded and confirmed", async () => {
  const { authUser, listingId, carMedia } = await createListingWithCar();
  await minioClient.putObject(
    carBucketName,
    carMedia[0].filename,
    Buffer.from("img"),
    3,
    { "Content-Type": "image/png" },
  );

  const response = await confirm(listingId, authUser.accessToken);
  expect(response.body.uploaded).toEqual([carMedia[0].filename]);
  expect(response.body.pending).toHaveLength(2);

  const details = await request(app).get(`/api/listings/${listingId}`);
  expect(details.body.listing.car.carMedias).toHaveLength(1);
});

it("should reject and remove uploaded media with a wrong content type", async () => {
  const { authUser, listingId, carMedia } = await createListingWithCar();
  await minioClient.putObject(
    carBucketName,
    carMedia[0].filename,
    Buffer.from("not an image"),
    12,
    { "Content-Type": "text/plain" },
  );

  const response = await confirm(listingId, authUser.accessToken);
  expect(response.body.rejected).toEqual([carMedia[0].filename]);

  const again = await confirm(listingId, authUser.accessToken);
  expect(again.body.pending).toHaveLength(2);
  expect(again.body.rejected).toHaveLength(0);
});

import request from "supertest";
import { app } from "../../../app";
import {
  submitWithImages,
  signinUser,
  signupUserWithVerification,
} from "../../../test/helpers";
import { createBucket, readTemplateFile } from "../../../utils/functions";
import { minioClient } from "../../../file_storage/minio";
import { carBucketName } from "../../../utils/constants";

beforeAll(async () => {
  await createBucket(carBucketName);
});

type Seller = Awaited<ReturnType<typeof signinUser>>;

// A listing buyers can see, unless `approve` is false. A new seller signs up
// unless one is given.
const createListing = async ({
  approve = true,
  seller,
}: { approve?: boolean; seller?: Seller } = {}) => {
  let authUser = seller;
  if (!authUser) {
    await signupUserWithVerification({ userType: "seller" });
    authUser = await signinUser();
  }

  const title = "A black car for sale";
  const description =
    "A brand new Ford for sale with black wheel and black interior";

  const response = await request(app)
    .post("/api/listings")
    .send({
      title,
      description,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  const listingId = response.body.listing.id as number;

  await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send({
      makeId: 449,
      modelId: 2085,
      carburantId: 3,
      originId: 2,
      stateId: 3,
      price: 70000,
      year: 2010,
      ownersCount: 2,
      cityId: 1,
      transmission: "automatic",
      distance: "180000KM",
      fiscalPower: 7,
      doorsNumber: 5,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  await submitWithImages(listingId, authUser.accessToken);

  if (approve) {
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    await request(app)
      .patch(`/api/listings/${listingId}/approve`)
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);
  }

  return { listingId, title, description, seller: authUser };
};

it("should return an error if the user whos trying to favor a listing is not of type buyer", async () => {
  const email = "john@example.com";

  await signupUserWithVerification({
    userType: "seller",
    email: email,
  });
  const authUser = await signinUser({
    email: email,
  });

  const response = await request(app)
    .post("/api/favorite_listings")
    .send({
      listingId: 1,
    })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(403);
});

it("should be able to add listing to user favorites when he is of type buyer and provides listingId in the request body", async () => {
  const { listingId } = await createListing();
  const buyerEmail = "john@example.com";
  (readTemplateFile as jest.Mock).mockReset();

  await signupUserWithVerification({
    userType: "buyer",
    email: buyerEmail,
  });
  const authUser = await signinUser({
    email: buyerEmail,
  });
  expect(authUser.user.role).toBe("buyer");

  const response = await request(app)
    .post("/api/favorite_listings")
    .send({
      listingId,
    })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(201);
});

it("should return validation error if the payload is incorrect", async () => {
  const buyerEmail = "john@example.com";

  await signupUserWithVerification({
    userType: "buyer",
    email: buyerEmail,
  });
  const authUser = await signinUser({
    email: buyerEmail,
  });

  const response = await request(app)
    .post("/api/favorite_listings")
    .send({
      listingId: "abc",
    })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(400);
});

it("should remove listing from favorites", async () => {
  const { listingId } = await createListing();
  const buyerEmail = "john@example.com";
  (readTemplateFile as jest.Mock).mockReset();

  await signupUserWithVerification({
    userType: "buyer",
    email: buyerEmail,
  });
  const authUser = await signinUser({
    email: buyerEmail,
  });

  await request(app)
    .post("/api/favorite_listings")
    .send({
      listingId,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  await request(app)
    .delete(`/api/favorite_listings/${listingId}`)
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(200);
});

it("should succeed when removing a listing that is not a favorite", async () => {
  const buyerEmail = "john@example.com";
  (readTemplateFile as jest.Mock).mockReset();

  await signupUserWithVerification({
    userType: "buyer",
    email: buyerEmail,
  });
  const authUser = await signinUser({
    email: buyerEmail,
  });

  const response = await request(app)
    .delete(`/api/favorite_listings/1`)
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(200);
  expect(response.body).toEqual({ count: 0 });
});

it("should return user favorite list", async () => {
  const { listingId, title } = await createListing();
  const buyerEmail = "john@example.com";
  (readTemplateFile as jest.Mock).mockReset();

  await signupUserWithVerification({
    userType: "buyer",
    email: buyerEmail,
  });
  const authUser = await signinUser({
    email: buyerEmail,
  });

  await request(app)
    .post("/api/favorite_listings")
    .send({
      listingId,
    })
    .auth(authUser.accessToken, { type: "bearer" });

  const response = await request(app)
    .get("/api/favorite_listings")
    .send()
    .auth(authUser.accessToken, { type: "bearer" });

  const listings = response.body.listings;

  expect(listings).toHaveLength(1);
  expect(listings[0].id).toBe(listingId);
  expect(listings[0].title).toBe(title);
  expect(listings[0].car.carMedias.length).toBeGreaterThanOrEqual(1);
});

const signinBuyer = async () => {
  (readTemplateFile as jest.Mock).mockReset();
  await signupUserWithVerification({
    userType: "buyer",
    email: "john@example.com",
  });
  return signinUser({ email: "john@example.com" });
};

it("should accept a listing that is already a favorite", async () => {
  const { listingId } = await createListing();
  const buyer = await signinBuyer();

  const add = () =>
    request(app)
      .post("/api/favorite_listings")
      .send({ listingId })
      .auth(buyer.accessToken, { type: "bearer" });

  expect((await add()).body).toEqual({ listingId, created: true });
  const again = await add();
  expect(again.statusCode).toBe(200);
  expect(again.body).toEqual({ listingId, created: false });
});

it("should refuse a listing that is missing or not approved", async () => {
  const { listingId } = await createListing({ approve: false });
  const buyer = await signinBuyer();

  for (const id of [listingId, 999999]) {
    const response = await request(app)
      .post("/api/favorite_listings")
      .send({ listingId: id })
      .auth(buyer.accessToken, { type: "bearer" })
      .expect(404);
    expect(response.body.errors[0].code).toBe("listing.not_found");
  }
});

it("should return the ids of the buyer's favorites", async () => {
  const first = await createListing();
  const second = await createListing({ seller: first.seller });
  const buyer = await signinBuyer();

  for (const { listingId } of [first, second]) {
    await request(app)
      .post("/api/favorite_listings")
      .send({ listingId })
      .auth(buyer.accessToken, { type: "bearer" })
      .expect(201);
  }

  const response = await request(app)
    .get("/api/favorite_listings/ids")
    .auth(buyer.accessToken, { type: "bearer" })
    .expect(200);
  expect(response.body).toEqual({
    listingIds: [second.listingId, first.listingId],
  });
});

it("should refuse the favorite ids to other roles", async () => {
  await signupUserWithVerification({
    userType: "seller",
    email: "seller@example.com",
  });
  const seller = await signinUser({ email: "seller@example.com" });

  await request(app)
    .get("/api/favorite_listings/ids")
    .auth(seller.accessToken, { type: "bearer" })
    .expect(403);
});

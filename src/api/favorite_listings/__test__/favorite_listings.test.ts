import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { readTemplateFile } from "../../../utils/functions";

const createListing = async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();

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
    .post(`/api/listings/${listingId}/cars`)
    .send({
      makeId: 449,
      modelId: 2085,
      carburantId: 3,
      originId: 4,
      stateId: 6,
      price: 500000,
      year: 2025,
      ownersCount: 0,
      city: "Casablanca",
      distance: "60km",
      transmission: "automatic",
      fiscalPower: 8,
      doorsNumber: 5,
      filenames: ["pic_1.jpeg", "pic_2.jpeg", "pic_3.jpeg"],
    })
    .auth(authUser.accessToken, { type: "bearer" });

  return { listingId, title, description };
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

it("should return an error if the user wants to remove listing from favorites that does not exist", async () => {
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
    .delete(`/api/favorite_listings/1`)
    .auth(authUser.accessToken, { type: "bearer" })
    .expect(400);
});

it("should return user favorite list", async () => {
  const { listingId, description, title } = await createListing();
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
  console.log(response);
  const listings = response.body.listings;

  expect(listings).toHaveLength(1);
  expect(listings[0].listingId).toBe(listingId);
  expect(listings[0].listingTitle).toBe(title);
  expect(listings[0].listingDescription).toBe(description);
  expect(listings[0].images.length).toBeGreaterThanOrEqual(1);
});

import request from "supertest";
import { app } from "../../../app";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";

it("should fail if the user who want to create a listing is not logged in", () => {
  return request(app).post("/api/listings").expect(401);
});

it("should fail if user is not of type seller", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();
  const response = await request(app)
    .post("/api/listings")
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(403);
});

it("should validate create listing request", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  expect(authUser.user.role).toBe("seller");
  const response = await request(app)
    .post("/api/listings")
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(400);
});

it("should create listing and return data", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  expect(authUser.user.role).toBe("seller");

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

  expect(response.statusCode).toBe(201);
  expect(response.body.listing.userId).toBe(authUser.user.id);
  expect(response.body.listing.status).toBe("draft");
  expect(response.body.listing.title).toBe(title);
  expect(response.body.listing.description).toBe(description);
});

it("should fail when non admin tries to approve a listing", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();
  const response = await request(app)
    .patch("/api/listings/1/approve")
    .auth(authUser.accessToken, { type: "bearer" })
    .send();
  expect(response.statusCode).toBe(403);
});

it("should fail when listing does not exist", async () => {
  const authUser = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  const response = await request(app)
    .patch("/api/listings/1/approve")
    .auth(authUser.accessToken, { type: "bearer" })
    .send();
  expect(response.statusCode).toBe(404);
});

it("should return validation error when trying to attach car to listing with invalid data", async () => {
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

  const listingId = response.body.listing.id;

  const attachCarResponse = await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send({})
    .auth(authUser.accessToken, { type: "bearer" });

  expect(attachCarResponse.statusCode).toBe(400);
  expect(attachCarResponse.body.errors).toHaveLength(14);
});

it("should attach car to a listing", async () => {
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

  const listingId = response.body.listing.id;

  const attachCarResponse = await request(app)
    .post(`/api/listings/${listingId}/car`)
    .send({
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
      files: [
        { name: "file1.png", isPrimary: true, type: "image" },
        { name: "file2.png", isPrimary: false, type: "image" },
      ],
    })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(attachCarResponse.statusCode).toBe(201);
  const { carMedia } = attachCarResponse.body;
  expect(carMedia).toHaveLength(2);
  expect(carMedia[0].originalName).toBe("file1.png");
  expect(carMedia[0].upload.url).toContain("/cars");
  expect(carMedia[0].upload.fields.key).toBe(carMedia[0].filename);
  expect(carMedia[0].upload.fields.policy).toBeDefined();
  expect(carMedia[0].filename).toMatch(/^car-[a-f0-9]+\.png$/);
  expect(carMedia[0].filename).not.toBe(carMedia[1].filename);
});

it("should fail when a non seller tries to attach a car to a listing", async () => {
  await signupUserWithVerification({ userType: "buyer" });
  const authUser = await signinUser();

  const response = await request(app)
    .post("/api/listings/1/car")
    .send({})
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(403);
});

it("should reject out of range car values when attaching a car", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });

  const response = await request(app)
    .post(`/api/listings/${created.body.listing.id}/car`)
    .send({
      makeId: 449,
      modelId: 2085,
      carburantId: 3,
      originId: 4,
      stateId: 6,
      price: -1,
      year: 1800,
      ownersCount: -2,
      cityId: 1,
      distance: "  ",
      transmission: "automatic",
      fiscalPower: 0,
      doorsNumber: 12,
      files: [{ name: "file1.png", isPrimary: true }],
    })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
  const fields = response.body.errors.map(
    (error: { field: string }) => error.field,
  );
  expect(fields.sort()).toEqual(
    [
      "distance",
      "doorsNumber",
      "fiscalPower",
      "ownersCount",
      "price",
      "year",
    ].sort(),
  );
});

it("should reject duplicate file names when attaching a car", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });

  const response = await request(app)
    .post(`/api/listings/${created.body.listing.id}/car`)
    .send({
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
      files: [
        { name: "file1.png", isPrimary: true },
        { name: "FILE1.png", isPrimary: false },
      ],
    })
    .auth(authUser.accessToken, { type: "bearer" });

  expect(response.statusCode).toBe(400);
  expect(response.body.errors[0].message).toBe("File names must be unique.");
});

describe("car reference validation", () => {
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

  const createListing = async () => {
    await signupUserWithVerification({ userType: "seller" });
    const authUser = await signinUser();
    const created = await request(app)
      .post("/api/listings")
      .send({ title: "A black car", description: "A brand new black Ford" })
      .auth(authUser.accessToken, { type: "bearer" });
    return { authUser, listingId: created.body.listing.id };
  };

  it("should return 400 when referenced ids do not exist", async () => {
    const { authUser, listingId } = await createListing();
    const response = await request(app)
      .post(`/api/listings/${listingId}/car`)
      .send({ ...validCar, carburantId: 99999, cityId: 99999 })
      .auth(authUser.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(400);
    const fields = response.body.errors.map(
      (error: { field: string }) => error.field,
    );
    expect(fields.sort()).toEqual(["carburantId", "cityId"]);
  });

  it("should return 400 when the model does not belong to the make", async () => {
    const { authUser, listingId } = await createListing();
    const response = await request(app)
      .post(`/api/listings/${listingId}/car`)
      .send({ ...validCar, makeId: 440 })
      .auth(authUser.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].field).toBe("modelId");
  });

  it("should return 400 on update when a referenced id does not exist", async () => {
    const { authUser, listingId } = await createListing();
    await request(app)
      .post(`/api/listings/${listingId}/car`)
      .send(validCar)
      .auth(authUser.accessToken, { type: "bearer" });

    const response = await request(app)
      .patch(`/api/listings/${listingId}`)
      .send({ car: { cityId: 99999 } })
      .auth(authUser.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors[0].field).toBe("cityId");
  });
});

it("should return 400 instead of 500 when two cars are attached at the same time", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });
  const listingId = created.body.listing.id;

  const attach = () =>
    request(app)
      .post(`/api/listings/${listingId}/car`)
      .send({
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
      })
      .auth(authUser.accessToken, { type: "bearer" });

  const responses = await Promise.all([attach(), attach(), attach()]);
  const statuses = responses.map((response) => response.statusCode).sort();

  expect(statuses).toEqual([201, 400, 400]);
});

it("should restrict car media uploads by size and content type", async () => {
  await signupUserWithVerification({ userType: "seller" });
  const authUser = await signinUser();
  const created = await request(app)
    .post("/api/listings")
    .send({ title: "A black car", description: "A brand new black Ford" })
    .auth(authUser.accessToken, { type: "bearer" });

  const response = await request(app)
    .post(`/api/listings/${created.body.listing.id}/car`)
    .send({
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
      files: [
        { name: "photo.png", isPrimary: true },
        { name: "walkaround.mp4", isPrimary: false },
      ],
    })
    .auth(authUser.accessToken, { type: "bearer" });
  expect(response.statusCode).toBe(201);

  const decode = (policy: string) =>
    JSON.parse(Buffer.from(policy, "base64").toString("utf8")).conditions;
  const [image, video] = response.body.carMedia.map(
    (media: { upload: { fields: { policy: string } } }) =>
      decode(media.upload.fields.policy),
  );

  expect(image).toContainEqual(["content-length-range", 1, 10 * 1024 * 1024]);
  expect(image).toContainEqual(["starts-with", "$Content-Type", "image/"]);
  expect(video).toContainEqual(["content-length-range", 1, 50 * 1024 * 1024]);
  expect(video).toContainEqual(["starts-with", "$Content-Type", "video/"]);
});

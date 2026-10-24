import request from "supertest";
import { app } from "../../../app";
import { db } from "../../../db";
import { appSettingsTable } from "../../../db/schema/app_settings";
import { signinUser, signupUserWithVerification } from "../../../test/helpers";
import { getSetting, loadSettings } from "../../../settings/store";

const signinAdmin = () =>
  signinUser({ email: "admin@autosouk.com", password: "Admin_@@789" });

const patchSettings = async (values: Record<string, unknown>) => {
  const admin = await signinAdmin();
  return request(app)
    .patch("/api/settings")
    .send({ values })
    .auth(admin.accessToken, { type: "bearer" });
};

const errorFields = (response: request.Response) =>
  response.body.errors.map((error: { field: string }) => error.field);

describe("GET /api/settings/public", () => {
  it("should return only public settings without authentication", async () => {
    const response = await request(app).get("/api/settings/public").expect(200);

    expect(response.headers["cache-control"]).toBe("public, no-cache");
    expect(response.body.settings["uploads.carImage.maxSizeBytes"]).toBe(
      10 * 1024 * 1024,
    );
    expect(response.body.settings).not.toHaveProperty(
      "auth.emailTokenExpirationMinutes",
    );
  });
});

describe("GET /api/settings/public revalidation", () => {
  it("should return a strong ETag that is stable while nothing changes", async () => {
    const first = await request(app).get("/api/settings/public").expect(200);
    const second = await request(app).get("/api/settings/public").expect(200);

    expect(first.headers.etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  it("should answer 304 without a body when If-None-Match matches", async () => {
    const { etag } = (await request(app).get("/api/settings/public")).headers;

    const response = await request(app)
      .get("/api/settings/public")
      .set("If-None-Match", etag)
      .expect(304);

    expect(response.text).toBe("");
    expect(response.headers.etag).toBe(etag);
  });

  it("should match a weak tag, as If-None-Match uses weak comparison", async () => {
    const { etag } = (await request(app).get("/api/settings/public")).headers;

    await request(app)
      .get("/api/settings/public")
      .set("If-None-Match", `W/${etag}`)
      .expect(304);
  });

  it("should return new content and a new ETag after a public setting changes", async () => {
    const { etag } = (await request(app).get("/api/settings/public")).headers;
    await patchSettings({ "uploads.carImage.maxSizeBytes": 5 * 1024 * 1024 });

    const response = await request(app)
      .get("/api/settings/public")
      .set("If-None-Match", etag)
      .expect(200);

    expect(response.headers.etag).not.toBe(etag);
    expect(response.body.settings["uploads.carImage.maxSizeBytes"]).toBe(
      5 * 1024 * 1024,
    );
  });

  it("should keep the ETag when only a private setting changes", async () => {
    const { etag } = (await request(app).get("/api/settings/public")).headers;
    const update = await patchSettings({
      "auth.emailTokenExpirationMinutes": 15,
    });
    expect(update.statusCode).toBe(200);

    await request(app)
      .get("/api/settings/public")
      .set("If-None-Match", etag)
      .expect(304);
  });
});

describe("GET /api/settings", () => {
  it("should require authentication", () => {
    return request(app).get("/api/settings").expect(401);
  });

  it("should reject non admin users", async () => {
    await signupUserWithVerification({ userType: "seller" });
    const seller = await signinUser();
    await request(app)
      .get("/api/settings")
      .auth(seller.accessToken, { type: "bearer" })
      .expect(403);
  });

  it("should list every setting with its default", async () => {
    const admin = await signinAdmin();
    const response = await request(app)
      .get("/api/settings")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    const doors = response.body.settings.find(
      (setting: { key: string }) => setting.key === "listings.car.maxDoors",
    );
    expect(doors).toMatchObject({
      value: 9,
      defaultValue: 9,
      isDefault: true,
      isPublic: true,
      updatedBy: null,
    });
  });
});

describe("PATCH /api/settings", () => {
  it("should reject unknown settings", async () => {
    const response = await patchSettings({ "uploads.unknown": 1 });
    expect(response.statusCode).toBe(400);
    expect(errorFields(response)).toEqual(["uploads.unknown"]);
  });

  it("should reject invalid values", async () => {
    const response = await patchSettings({
      "uploads.carImage.maxSizeBytes": -1,
      "uploads.allowedImageExtensions": [],
    });
    expect(response.statusCode).toBe(400);
    expect(errorFields(response).sort()).toEqual([
      "uploads.allowedImageExtensions",
      "uploads.carImage.maxSizeBytes",
    ]);
  });

  it("should reject changes breaking a rule across settings and save nothing", async () => {
    const response = await patchSettings({
      "listings.car.minDoors": 6,
      "listings.car.maxDoors": 4,
    });
    expect(response.statusCode).toBe(400);
    expect(getSetting("listings.car.minDoors")).toBe(1);
    expect(getSetting("listings.car.maxDoors")).toBe(9);
  });

  it("should reject an extension listed as both image and video", async () => {
    const response = await patchSettings({
      "uploads.allowedVideoExtensions": ["mp4", "png"],
    });
    expect(response.statusCode).toBe(400);
    expect(errorFields(response)).toEqual(["uploads.allowedVideoExtensions"]);
  });

  it("should save overrides and record the admin", async () => {
    const admin = await signinAdmin();
    const response = await request(app)
      .patch("/api/settings")
      .send({ values: { "uploads.carVideo.maxSizeBytes": 100 * 1024 * 1024 } })
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    const video = response.body.settings.find(
      (setting: { key: string }) =>
        setting.key === "uploads.carVideo.maxSizeBytes",
    );
    expect(video).toMatchObject({
      value: 100 * 1024 * 1024,
      isDefault: false,
      updatedBy: admin.user.id,
    });

    const publicResponse = await request(app).get("/api/settings/public");
    expect(publicResponse.body.settings["uploads.carVideo.maxSizeBytes"]).toBe(
      100 * 1024 * 1024,
    );
  });

  it("should apply car limits to listing validation without a restart", async () => {
    await patchSettings({ "listings.car.maxDoors": 4 });

    await signupUserWithVerification({ userType: "seller" });
    const seller = await signinUser();
    const created = await request(app)
      .post("/api/listings")
      .send({ title: "A black car", description: "A brand new black Ford" })
      .auth(seller.accessToken, { type: "bearer" });

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
        files: [{ name: "file1.png", isPrimary: true }],
      })
      .auth(seller.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      { field: "doorsNumber", message: "Doors number must be between 1 and 4" },
    ]);
  });

  it("should apply allowed extensions to upload validation", async () => {
    await patchSettings({
      "uploads.allowedImageExtensions": ["jpg", "jpeg", "png", "webp", "gif"],
    });

    const response = await request(app).post("/api/auth/register").send({
      firstName: "John",
      lastName: "Doe",
      email: "user@example.com",
      password: "USEr_@@852852",
      phone: "+212685412593",
      userType: "buyer",
      cityId: 1,
      imageName: "avatar.gif",
    });

    expect(response.statusCode).toBe(201);
  });
});

describe("DELETE /api/settings/:key", () => {
  it("should reset a setting to its default", async () => {
    await patchSettings({ "listings.car.maxDoors": 4 });
    const admin = await signinAdmin();

    await request(app)
      .delete("/api/settings/listings.car.maxDoors")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    expect(getSetting("listings.car.maxDoors")).toBe(9);
  });

  it("should return 404 for an unknown setting", async () => {
    const admin = await signinAdmin();
    await request(app)
      .delete("/api/settings/uploads.unknown")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(404);
  });

  it("should refuse a reset that would break a rule", async () => {
    await patchSettings({
      "listings.car.minDoors": 10,
      "listings.car.maxDoors": 12,
    });
    const admin = await signinAdmin();

    const response = await request(app)
      .delete("/api/settings/listings.car.maxDoors")
      .auth(admin.accessToken, { type: "bearer" });

    expect(response.statusCode).toBe(400);
    expect(getSetting("listings.car.maxDoors")).toBe(12);
  });
});

describe("settings store", () => {
  it("should pick up changes written by another instance on reload", async () => {
    await db
      .insert(appSettingsTable)
      .values({ key: "listings.car.minYear", value: 1990 });
    expect(getSetting("listings.car.minYear")).toBe(1950);

    await loadSettings();
    expect(getSetting("listings.car.minYear")).toBe(1990);
  });

  it("should fall back to defaults for invalid or inconsistent stored values", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await db.insert(appSettingsTable).values([
      { key: "uploads.carImage.maxSizeBytes", value: "big" },
      { key: "listings.car.minDoors", value: 8 },
      { key: "listings.car.maxDoors", value: 3 },
      { key: "removed.setting", value: true },
    ]);

    await loadSettings();

    expect(getSetting("uploads.carImage.maxSizeBytes")).toBe(10 * 1024 * 1024);
    expect(getSetting("listings.car.minDoors")).toBe(1);
    expect(getSetting("listings.car.maxDoors")).toBe(9);
  });

  it("should not allow mutating the settings snapshot", () => {
    const extensions = getSetting("uploads.allowedImageExtensions") as string[];
    expect(() => extensions.push("exe")).toThrow();
  });
});

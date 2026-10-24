import request from "supertest";
import { app } from "../../../app";
import { signinUser } from "../../../test/helpers";

type AdminToken = string;

const signinAdmin = async (): Promise<AdminToken> => {
  const admin = await signinUser({
    email: "admin@autosouk.com",
    password: "Admin_@@789",
  });
  return admin.accessToken;
};

const getSettings = (token: AdminToken) =>
  request(app).get("/api/settings").auth(token, { type: "bearer" });

const patchSettings = (
  token: AdminToken,
  values: Record<string, unknown>,
  ifMatch?: string,
) => {
  const call = request(app)
    .patch("/api/settings")
    .send({ values })
    .auth(token, { type: "bearer" });
  return ifMatch === undefined ? call : call.set("If-Match", ifMatch);
};

const resetSetting = (token: AdminToken, key: string, ifMatch?: string) => {
  const call = request(app)
    .delete(`/api/settings/${key}`)
    .auth(token, { type: "bearer" });
  return ifMatch === undefined ? call : call.set("If-Match", ifMatch);
};

const settingValue = (response: request.Response, key: string): unknown =>
  response.body.settings.find((setting: { key: string }) => setting.key === key)
    ?.value;

const versionOf = (etag: string) => Number(etag.replace(/"/g, ""));

describe("settings ETag", () => {
  it("should return the settings version as a strong ETag", async () => {
    const token = await signinAdmin();

    const response = await getSettings(token).expect(200);

    expect(response.headers.etag).toMatch(/^"\d+"$/);
  });

  it("should return a new ETag after a write", async () => {
    const token = await signinAdmin();
    const before = (await getSettings(token)).headers.etag;

    const response = await patchSettings(token, {
      "listings.car.minYear": 1990,
    }).expect(200);

    expect(versionOf(response.headers.etag)).toBe(versionOf(before) + 1);
  });
});

describe("If-Match on PATCH /api/settings", () => {
  it("should apply the update when If-Match is current", async () => {
    const token = await signinAdmin();
    const { etag } = (await getSettings(token)).headers;

    const response = await patchSettings(
      token,
      { "listings.car.minYear": 1990 },
      etag,
    ).expect(200);

    expect(settingValue(response, "listings.car.minYear")).toBe(1990);
  });

  it("should refuse a stale If-Match with 412 and save nothing", async () => {
    const token = await signinAdmin();
    const stale = (await getSettings(token)).headers.etag;
    await patchSettings(token, { "listings.car.maxDoors": 7 }).expect(200);

    const response = await patchSettings(
      token,
      { "listings.car.minYear": 1990 },
      stale,
    ).expect(412);

    expect(response.body.errors[0].message).toMatch(/changed by someone else/);
    const current = await getSettings(token);
    expect(settingValue(current, "listings.car.minYear")).toBe(1950);
  });

  it("should accept a list containing the current version", async () => {
    const token = await signinAdmin();
    const { etag } = (await getSettings(token)).headers;

    await patchSettings(
      token,
      { "listings.car.minYear": 1990 },
      `"999999", ${etag}`,
    ).expect(200);
  });

  it("should skip the check for If-Match: *", async () => {
    const token = await signinAdmin();

    await patchSettings(token, { "listings.car.minYear": 1990 }, "*").expect(
      200,
    );
  });

  it("should never match a weak ETag", async () => {
    const token = await signinAdmin();
    const { etag } = (await getSettings(token)).headers;

    await patchSettings(
      token,
      { "listings.car.minYear": 1990 },
      `W/${etag}`,
    ).expect(412);
  });

  it("should reject a malformed If-Match with 400", async () => {
    const token = await signinAdmin();

    const response = await patchSettings(
      token,
      { "listings.car.minYear": 1990 },
      "seven",
    ).expect(400);

    expect(response.body.errors).toEqual([
      {
        message: 'If-Match must be "*" or quoted settings versions',
        field: "if-match",
      },
    ]);
  });
});

describe("If-Match on DELETE /api/settings/:key", () => {
  it("should refuse a stale If-Match with 412 and keep the override", async () => {
    const token = await signinAdmin();
    await patchSettings(token, { "listings.car.minYear": 1990 }).expect(200);
    const stale = (await getSettings(token)).headers.etag;
    await patchSettings(token, { "listings.car.maxDoors": 7 }).expect(200);

    await resetSetting(token, "listings.car.minYear", stale).expect(412);

    const current = await getSettings(token);
    expect(settingValue(current, "listings.car.minYear")).toBe(1990);
  });

  it("should reset when If-Match is current", async () => {
    const token = await signinAdmin();
    await patchSettings(token, { "listings.car.minYear": 1990 }).expect(200);
    const { etag } = (await getSettings(token)).headers;

    const response = await resetSetting(
      token,
      "listings.car.minYear",
      etag,
    ).expect(200);

    expect(settingValue(response, "listings.car.minYear")).toBe(1950);
  });
});

describe("concurrent settings writes", () => {
  it("should never let two concurrent updates break a rule together", async () => {
    const token = await signinAdmin();

    // Each change is valid against the defaults (doors 1 to 9), but together
    // they make minDoors greater than maxDoors.
    for (let round = 0; round < 5; round++) {
      const responses = await Promise.all([
        patchSettings(token, { "listings.car.minDoors": 8 }),
        patchSettings(token, { "listings.car.maxDoors": 5 }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([
        200, 400,
      ]);
      const current = await getSettings(token);
      const minDoors = settingValue(current, "listings.car.minDoors") as number;
      const maxDoors = settingValue(current, "listings.car.maxDoors") as number;
      expect(minDoors).toBeLessThanOrEqual(maxDoors);

      await resetSetting(token, "listings.car.minDoors").expect(200);
      await resetSetting(token, "listings.car.maxDoors").expect(200);
    }
  });

  it("should give concurrent updates distinct versions", async () => {
    const token = await signinAdmin();
    const start = versionOf((await getSettings(token)).headers.etag);

    const responses = await Promise.all(
      [1960, 1970, 1980, 1990].map((year) =>
        patchSettings(token, { "listings.car.minYear": year }),
      ),
    );

    const versions = responses.map((response) =>
      versionOf(response.headers.etag),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    expect(Math.max(...versions)).toBe(start + 4);
    const final = versionOf((await getSettings(token)).headers.etag);
    expect(final).toBe(start + 4);
  });
});

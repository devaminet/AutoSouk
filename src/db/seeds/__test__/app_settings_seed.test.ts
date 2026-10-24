import { eq } from "drizzle-orm";
import request from "supertest";
import { app } from "../../../app";
import { db } from "../..";
import {
  appSettingsTable,
  appSettingsVersionTable,
} from "../../schema/app_settings";
import { generateAppSettingsData } from "../app_settings_seed";
import { settingDefinitions, settingKeys } from "../../../settings/definitions";
import { getSetting, loadSettings } from "../../../settings/store";
import { signinUser } from "../../../test/helpers";

const findRows = () =>
  db
    .select({
      key: appSettingsTable.key,
      value: appSettingsTable.value,
      updatedBy: appSettingsTable.updatedBy,
    })
    .from(appSettingsTable);

const findVersion = async () => {
  const [row] = await db
    .select({ version: appSettingsVersionTable.version })
    .from(appSettingsVersionTable);
  return row?.version ?? 0;
};

describe("app settings seed", () => {
  it("should store every setting's code default", async () => {
    await generateAppSettingsData();

    const rows = await findRows();
    expect(rows).toHaveLength(settingKeys.length);
    expect(rows).toEqual(
      expect.arrayContaining(
        settingKeys.map((key) => ({
          key,
          value: settingDefinitions[key].defaultValue,
          updatedBy: null,
        })),
      ),
    );
  });

  it("should bump the version once and do nothing on repeated runs", async () => {
    const before = await findVersion();

    await generateAppSettingsData();
    const afterFirstRun = await findVersion();
    await generateAppSettingsData();

    expect(afterFirstRun).toBe(before + 1);
    await expect(findVersion()).resolves.toBe(afterFirstRun);
    await expect(findRows()).resolves.toHaveLength(settingKeys.length);
  });

  it("should never overwrite a value an admin changed", async () => {
    await generateAppSettingsData();
    await db
      .update(appSettingsTable)
      .set({ value: 1990 })
      .where(eq(appSettingsTable.key, "listings.car.minYear"));

    await generateAppSettingsData();

    const [row] = await db
      .select({ value: appSettingsTable.value })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "listings.car.minYear"));
    expect(row.value).toBe(1990);
  });

  it("should add only the settings that are missing", async () => {
    await generateAppSettingsData();
    await db
      .delete(appSettingsTable)
      .where(eq(appSettingsTable.key, "listings.car.maxDoors"));

    await generateAppSettingsData();

    await expect(findRows()).resolves.toHaveLength(settingKeys.length);
  });

  it("should serve the seeded values as defaults", async () => {
    await generateAppSettingsData();
    await loadSettings();

    expect(getSetting("listings.car.minYear")).toBe(1950);
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    const response = await request(app)
      .get("/api/settings")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);
    expect(
      response.body.settings.every(
        (setting: { isDefault: boolean }) => setting.isDefault,
      ),
    ).toBe(true);
  });

  it("should keep the row and restore the default on reset", async () => {
    await generateAppSettingsData();
    await loadSettings();
    const admin = await signinUser({
      email: "admin@autosouk.com",
      password: "Admin_@@789",
    });
    await request(app)
      .patch("/api/settings")
      .send({ values: { "listings.car.minYear": 1990 } })
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    const response = await request(app)
      .delete("/api/settings/listings.car.minYear")
      .auth(admin.accessToken, { type: "bearer" })
      .expect(200);

    const [row] = await db
      .select({
        value: appSettingsTable.value,
        updatedBy: appSettingsTable.updatedBy,
      })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "listings.car.minYear"));
    expect(row).toEqual({ value: 1950, updatedBy: admin.user.id });
    expect(
      response.body.settings.find(
        (setting: { key: string }) => setting.key === "listings.car.minYear",
      ),
    ).toMatchObject({ value: 1950, isDefault: true });
    expect(getSetting("listings.car.minYear")).toBe(1950);
  });
});

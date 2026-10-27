import { sourceLocale } from "../../utils/constants";
import { resources } from "../resources";
import { findCatalogIssues } from "./catalog_issues";

describe("translation catalogs", () => {
  it("have the same keys, placeholders and plural forms in every locale", () => {
    expect(findCatalogIssues(resources, sourceLocale)).toEqual([]);
  });
});

describe("findCatalogIssues", () => {
  const check = (fr: object, ar: object, en: object = { cars: "Cars" }) =>
    findCatalogIssues(
      { en: { errors: en }, fr: { errors: fr }, ar: { errors: ar } },
      "en",
    );

  it("reports missing and extra keys", () => {
    expect(check({}, { cars: "سيارات", extra: "إضافي" })).toEqual([
      "fr: errors:cars is missing",
      "ar: errors:extra is not in en",
    ]);
  });

  it("reports empty messages and nested keys", () => {
    expect(
      check(
        { group: { cars: " " } },
        { group: { cars: "سيارات" } },
        { group: { cars: "Cars" } },
      ),
    ).toEqual(["fr: errors:group.cars is empty"]);
  });

  it("reports different placeholders", () => {
    expect(
      check(
        { min: "Au moins {{count}}" },
        { min: "على الأقل {{min}}" },
        { min: "At least {{min}}" },
      ),
    ).toEqual(["fr: errors:min uses placeholders count, en uses min"]);
  });

  // French has a `many` form (1 000 000); without `_many`, i18next falls back
  // to the English message for such counts.
  it("requires every plural form of the locale", () => {
    const en = { cars_one: "{{count}} car", cars_other: "{{count}} cars" };
    const fr = {
      cars_one: "{{count}} voiture",
      cars_many: "{{count}} de voitures",
      cars_other: "{{count}} voitures",
    };
    const ar = {
      cars_zero: "لا سيارات",
      cars_one: "سيارة واحدة",
      cars_two: "سيارتان",
      cars_few: "{{count}} سيارات",
      cars_other: "{{count}} سيارة",
    };

    expect(check(fr, ar, en)).toEqual([
      "ar: errors:cars is missing plural form _many",
    ]);
  });

  it("reports a plural key that is a plain message elsewhere", () => {
    expect(
      check(
        { cars_one: "voiture", cars_other: "voitures" },
        { cars: "سيارات" },
      ),
    ).toEqual(["fr: errors:cars must not have plural forms like en"]);
  });
});

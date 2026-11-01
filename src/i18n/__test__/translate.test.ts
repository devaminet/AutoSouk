import { parseDefaultLocale } from "../config";
import { apiDefaultLocale, translate } from "..";

describe("translate", () => {
  it("translates a key in each supported locale", () => {
    expect(translate("en", "errors:not_found")).toBe("Not found");
    expect(translate("fr", "errors:not_found")).toBe("Introuvable");
    expect(translate("ar", "errors:not_found")).toBe("غير موجود");
  });
});

describe("default locale", () => {
  it("is French when DEFAULT_LOCALE is not set or empty", () => {
    expect(parseDefaultLocale(undefined)).toBe("fr");
    expect(parseDefaultLocale("")).toBe("fr");
  });

  it("accepts a supported DEFAULT_LOCALE", () => {
    expect(parseDefaultLocale("ar")).toBe("ar");
  });

  it("rejects an unsupported DEFAULT_LOCALE", () => {
    expect(() => parseDefaultLocale("de")).toThrow();
  });

  it("is English in tests so existing assertions keep their messages", () => {
    expect(apiDefaultLocale).toBe("en");
  });
});

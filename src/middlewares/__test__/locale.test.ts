import request from "supertest";
import { app } from "../../app";

const localeOf = async (path: string, acceptLanguage?: string) => {
  const call = request(app).get(path);
  if (acceptLanguage !== undefined) {
    call.set("Accept-Language", acceptLanguage);
  }
  const response = await call;
  return response.headers["content-language"];
};

describe("locale middleware", () => {
  it("uses the API default without a preference", async () => {
    expect(await localeOf("/api/equipment")).toBe("en");
  });

  it("picks the best supported Accept-Language", async () => {
    expect(await localeOf("/api/equipment", "fr-FR,fr;q=0.9,en;q=0.8")).toBe(
      "fr",
    );
    expect(await localeOf("/api/equipment", "de;q=1,ar-MA;q=0.5")).toBe("ar");
  });

  it("falls back to the default for unsupported or wildcard languages", async () => {
    expect(await localeOf("/api/equipment", "de, es")).toBe("en");
    expect(await localeOf("/api/equipment", "*")).toBe("en");
  });

  it("lets ?lang= override Accept-Language", async () => {
    expect(await localeOf("/api/equipment?lang=ar", "fr")).toBe("ar");
  });

  it("ignores an unsupported ?lang=", async () => {
    expect(await localeOf("/api/equipment?lang=de", "fr")).toBe("fr");
  });

  it("varies cached responses on Accept-Language", async () => {
    const response = await request(app).get("/api/equipment");

    expect(response.headers.vary).toContain("Accept-Language");
  });

  it("sets the locale on errors, including unknown routes", async () => {
    expect(await localeOf("/api/does-not-exist", "ar")).toBe("ar");
  });

  it("sets the locale when the JSON body is malformed", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Accept-Language", "fr")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(response.headers["content-language"]).toBe("fr");
  });
});

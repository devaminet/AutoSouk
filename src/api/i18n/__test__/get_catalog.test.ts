import request from "supertest";
import { app } from "../../../app";
import { resources } from "../../../i18n/resources";

describe("GET /api/i18n/:locale/:namespace", () => {
  it("returns the catalog in i18next format", async () => {
    const response = await request(app).get("/api/i18n/ar/enums").expect(200);

    expect(response.body).toEqual(resources.ar.enums);
    expect(response.body.city.casablanca).toBe("الدار البيضاء");
  });

  it("serves the errors and messages namespaces with plural keys", async () => {
    const errors = await request(app).get("/api/i18n/fr/errors").expect(200);
    const messages = await request(app)
      .get("/api/i18n/en/messages")
      .expect(200);

    expect(errors.body.media.min_images_many).toBeDefined();
    expect(messages.body).toEqual(resources.en.messages);
  });

  it("is cacheable and revalidates with its ETag", async () => {
    const first = await request(app).get("/api/i18n/fr/enums").expect(200);

    expect(first.headers["cache-control"]).toBe("public, max-age=3600");
    expect(first.headers.etag).toEqual(expect.any(String));

    await request(app)
      .get("/api/i18n/fr/enums")
      .set("If-None-Match", first.headers.etag)
      .expect(304);
  });

  it.each([
    ["an unsupported locale", "/api/i18n/de/enums", "locale"],
    ["a server-only namespace", "/api/i18n/fr/emails", "namespace"],
  ])("rejects %s", async (_, path, field) => {
    const response = await request(app).get(path).expect(400);

    expect(response.body.errors).toEqual([
      expect.objectContaining({ code: "validation.invalid_option", field }),
    ]);
  });
});

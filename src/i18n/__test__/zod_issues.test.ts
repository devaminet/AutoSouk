import request from "supertest";
import { z, ZodTypeAny } from "zod";
import { app } from "../../app";
import { translate } from "..";
import { customIssue, messageKey, translateIssue } from "../zod_issues";

const issueOf = (schema: ZodTypeAny, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) {
    throw new Error("Expected the value to be invalid");
  }
  return translateIssue(result.error.issues[0]);
};

describe("translateIssue", () => {
  it.each([
    [
      "a missing value",
      z.object({ name: z.string() }),
      {},
      "validation.required",
    ],
    ["a wrong type", z.number(), "abc", "validation.invalid_type.number"],
    [
      "a coerced non-number",
      z.coerce.number(),
      "abc",
      "validation.invalid_type.number",
    ],
    [
      "a decimal for an integer",
      z.number().int(),
      1.5,
      "validation.invalid_type.integer",
    ],
    [
      "an invalid email",
      z.string().email(),
      "nope",
      "validation.invalid_email",
    ],
    [
      "an invalid datetime",
      z.string().datetime(),
      "today",
      "validation.invalid_datetime",
    ],
    [
      "a failed regex",
      z.string().regex(/^a$/),
      "b",
      "validation.invalid_format",
    ],
    [
      "a failed refine",
      z.string().refine(() => false),
      "a",
      "validation.invalid",
    ],
  ])("maps %s", (_, schema, value, code) => {
    expect(issueOf(schema, value).code).toBe(code);
  });

  it("maps size limits with their bound", () => {
    expect(issueOf(z.string().min(3), "ab")).toEqual({
      code: "validation.string_min",
      params: { count: 3 },
    });
    expect(issueOf(z.array(z.number()).max(2), [1, 2, 3])).toEqual({
      code: "validation.array_max",
      params: { count: 2 },
    });
    expect(issueOf(z.number().positive(), 0)).toEqual({
      code: "validation.number_gt",
      params: { minimum: 0 },
    });
    expect(issueOf(z.number().max(5), 6)).toEqual({
      code: "validation.number_max",
      params: { maximum: 5 },
    });
    expect(issueOf(z.date().min(new Date("2026-01-01")), new Date(0))).toEqual({
      code: "validation.date_min",
      params: { minimum: "2026-01-01" },
    });
  });

  it("lists the allowed options", () => {
    expect(issueOf(z.enum(["manual", "automatic"]), "boat")).toEqual({
      code: "validation.invalid_option",
      params: { options: "manual, automatic" },
    });
  });

  it("prefers a catalog key given as the message, with its params", () => {
    const schema = z.array(z.string()).refine(() => false, {
      message: messageKey("media.min_images"),
      params: { count: 3 },
    });

    expect(issueOf(schema, [])).toEqual({
      code: "media.min_images",
      params: { count: 3 },
    });
  });

  it("uses the issue's own bound for a key on a size check", () => {
    const schema = z.array(z.string()).max(2, messageKey("media.max_files"));

    expect(issueOf(schema, ["a", "b", "c"])).toEqual({
      code: "media.max_files",
      params: { count: 2 },
    });
  });

  it("replaces a message that is not a catalog key", () => {
    expect(issueOf(z.string().min(3, "Too short!"), "a").code).toBe(
      "validation.string_min",
    );
  });

  it("maps issues raised outside Zod", () => {
    expect(
      translateIssue(customIssue(["mediaIds"], "media.unknown", { id: 7 })),
    ).toEqual({ code: "media.unknown", params: { id: 7 } });
  });
});

describe("plural validation messages", () => {
  const atLeast = (count: number) =>
    translate("ar", "errors:validation.string_min", { count });

  it("uses every Arabic plural form", () => {
    expect(atLeast(1)).toBe("يجب أن يحتوي على حرف واحد على الأقل");
    expect(atLeast(2)).toBe("يجب أن يحتوي على حرفين على الأقل");
    expect(atLeast(3)).toBe("يجب أن يحتوي على 3 أحرف على الأقل");
    expect(atLeast(11)).toBe("يجب أن يحتوي على 11 حرفًا على الأقل");
    expect(atLeast(100)).toBe("يجب أن يحتوي على 100 حرف على الأقل");
  });

  it("uses the French form for large counts", () => {
    expect(
      translate("fr", "errors:validation.string_min", { count: 1000000 }),
    ).toBe("Doit contenir au moins 1000000 de caractères");
  });
});

describe("validation errors over HTTP", () => {
  it("returns a translated message, a code and a field per issue", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .set("Accept-Language", "fr")
      .send({ firstName: "Al", email: "nope", userType: "boss" })
      .expect(400);

    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        {
          code: "validation.string_min",
          message: "Doit contenir au moins 3 caractères",
          field: "firstName",
          params: { count: 3 },
        },
        {
          code: "validation.required",
          message: "Ce champ est obligatoire",
          field: "lastName",
        },
        {
          code: "validation.invalid_email",
          message: "Doit être une adresse e-mail valide",
          field: "email",
        },
        {
          code: "validation.invalid_option",
          message:
            "Doit être l'une des valeurs suivantes : buyer, seller, mechanic",
          field: "userType",
          params: { options: "buyer, seller, mechanic" },
        },
      ]),
    );
  });
});

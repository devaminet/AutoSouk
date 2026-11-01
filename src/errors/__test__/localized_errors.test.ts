import { Request, Response } from "express";
import request from "supertest";
import { app } from "../../app";
import errorHandler from "../../middlewares/error_handler";
import { signinUser, signupUserWithVerification } from "../../test/helpers";
import { BadRequestError } from "../bad_request_error";
import { NotFoundError } from "../not_found_error";

describe("localized errors", () => {
  it("translates a domain error and keeps its code", async () => {
    const response = await request(app)
      .get("/api/listings/999999")
      .set("Accept-Language", "fr")
      .expect(404);

    expect(response.body.errors).toEqual([
      { code: "listing.not_found", message: "Annonce introuvable" },
    ]);
  });

  it("translates authentication errors", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Accept-Language", "ar")
      .send({ email: "nobody@example.com", password: "Wrong_@@123456" })
      .expect(401);

    expect(response.body.errors).toEqual([
      {
        code: "auth.invalid_credentials",
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      },
    ]);
  });

  it("translates role errors from middleware", async () => {
    await signupUserWithVerification({ userType: "buyer" });
    const buyer = await signinUser();

    const response = await request(app)
      .post("/api/listings")
      .set("Accept-Language", "fr")
      .auth(buyer.accessToken, { type: "bearer" })
      .send({ title: "A car", description: "A car" })
      .expect(403);

    expect(response.body.errors).toEqual([
      { code: "forbidden", message: "Accès interdit" },
    ]);
  });

  it("translates the unknown route error", async () => {
    const response = await request(app)
      .get("/api/does-not-exist?lang=ar")
      .expect(404);

    expect(response.body.errors).toEqual([
      { code: "not_found", message: "غير موجود" },
    ]);
  });

  it("uses the default locale without a preference", async () => {
    const response = await request(app).get("/api/listings/999999");

    expect(response.body.errors[0].message).toBe("Listing was not found");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Accept-Language", "fr")
      .set("Content-Type", "application/json")
      .send("{ not json")
      .expect(400);

    expect(response.body.errors).toEqual([
      {
        code: "invalid_json",
        message: "Le corps de la requête n'est pas un JSON valide",
      },
    ]);
  });

  it("returns 413 for a body over the size limit", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "a".repeat(200 * 1024) })
      .expect(413);

    expect(response.body.errors).toEqual([
      { code: "payload_too_large", message: "The request body is too large" },
    ]);
  });
});

describe("error handler", () => {
  const handle = (error: Error, locale: Request["locale"]) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    errorHandler(
      error,
      { locale } as Request,
      res as unknown as Response,
      jest.fn(),
    );
    return res;
  };

  it("hides unexpected errors behind a translated generic message", () => {
    const res = handle(new Error("connection string leaked"), "fr");

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      errors: [{ code: "unexpected", message: "Une erreur est survenue" }],
    });
  });

  it("returns the params so clients can translate the code themselves", () => {
    const res = handle(new BadRequestError("bad_request", { limit: 3 }), "en");

    expect(res.json).toHaveBeenCalledWith({
      errors: [
        { code: "bad_request", message: "Bad request", params: { limit: 3 } },
      ],
    });
  });
});

describe("CustomError", () => {
  it("keeps the English text as the error message for logs", () => {
    expect(new NotFoundError("listing.not_found").message).toBe(
      "Listing was not found",
    );
  });
});

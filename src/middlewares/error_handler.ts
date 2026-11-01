import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { CustomError } from "../errors/custom_error";
import { ErrorKey, translate } from "../i18n";

// Errors raised by body-parser (and other http-errors producers) that are
// safe to report: a client error status with `expose` set.
const clientHttpErrorSchema = z.object({
  status: z.number().int().min(400).max(499),
  expose: z.literal(true),
  type: z.string().optional(),
});

const clientHttpErrorKeys: Record<string, ErrorKey> = {
  "entity.parse.failed": "invalid_json",
  "entity.too.large": "payload_too_large",
};

export default (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log("error", err);
  if (err instanceof CustomError) {
    res.status(err.statusCode).json({ errors: err.serializeError(req.locale) });
    return;
  }

  const httpError = clientHttpErrorSchema.safeParse(err);
  if (httpError.success) {
    const { status, type } = httpError.data;
    const code = (type && clientHttpErrorKeys[type]) || "bad_request";
    res.status(status).json({
      errors: [{ code, message: translate(req.locale, `errors:${code}`) }],
    });
    return;
  }

  res.status(500).json({
    errors: [
      {
        code: "unexpected",
        message: translate(req.locale, "errors:unexpected"),
      },
    ],
  });
};

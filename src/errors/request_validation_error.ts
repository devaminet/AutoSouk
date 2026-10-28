import { ZodIssue } from "zod";
import { Locale } from "../i18n";
import { CustomError, SerializedError } from "./custom_error";

export class RequestValidationError extends CustomError {
  statusCode = 400;

  constructor(private errors: ZodIssue[]) {
    super("validation");
  }

  serializeError(_locale: Locale): SerializedError[] {
    return this.errors.map((error) => ({
      code: this.code,
      message: error.message,
      field: error.path.join(".") || undefined,
    }));
  }
}

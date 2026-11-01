import { ErrorKey, TranslationParams } from "../i18n";
import { CustomError } from "./custom_error";

export class BadRequestError extends CustomError {
  statusCode = 400;

  constructor(code: ErrorKey = "bad_request", params?: TranslationParams) {
    super(code, params);
  }
}

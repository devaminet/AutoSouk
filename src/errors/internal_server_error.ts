import { ErrorKey, TranslationParams } from "../i18n";
import { CustomError } from "./custom_error";

export class InternalServerError extends CustomError {
  statusCode = 500;

  constructor(code: ErrorKey = "internal", params?: TranslationParams) {
    super(code, params);
  }
}

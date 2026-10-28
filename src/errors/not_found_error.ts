import { ErrorKey, TranslationParams } from "../i18n";
import { CustomError } from "./custom_error";

export class NotFoundError extends CustomError {
  statusCode = 404;

  constructor(code: ErrorKey = "not_found", params?: TranslationParams) {
    super(code, params);
  }
}

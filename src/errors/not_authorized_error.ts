import { ErrorKey, TranslationParams } from "../i18n";
import { CustomError } from "./custom_error";

export class NotAuthorizedError extends CustomError {
  statusCode = 401;

  constructor(code: ErrorKey = "not_authorized", params?: TranslationParams) {
    super(code, params);
  }
}

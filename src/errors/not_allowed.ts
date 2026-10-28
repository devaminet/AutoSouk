import { ErrorKey, TranslationParams } from "../i18n";
import { CustomError } from "./custom_error";

export class NotAllowedError extends CustomError {
  statusCode = 403;

  constructor(code: ErrorKey = "forbidden", params?: TranslationParams) {
    super(code, params);
  }
}

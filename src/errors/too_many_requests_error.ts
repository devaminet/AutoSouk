import { ErrorKey, TranslationParams } from "../i18n";
import { CustomError } from "./custom_error";

export class TooManyRequestsError extends CustomError {
  statusCode = 429;

  constructor(code: ErrorKey, params?: TranslationParams) {
    super(code, params);
  }
}

import { ZodIssue } from "zod";
import { Locale, translate } from "../i18n";
import { translateIssue } from "../i18n/zod_issues";
import { CustomError, SerializedError } from "./custom_error";

export class RequestValidationError extends CustomError {
  statusCode = 400;

  constructor(private issues: ZodIssue[]) {
    super("validation.failed");
  }

  serializeError(locale: Locale): SerializedError[] {
    return this.issues.map((issue) => {
      const { code, params } = translateIssue(issue);
      const hasParams = Object.keys(params).length > 0;
      return {
        code,
        message: translate(locale, `errors:${code}`, params),
        field: issue.path.join(".") || undefined,
        ...(hasParams && { params }),
      };
    });
  }
}

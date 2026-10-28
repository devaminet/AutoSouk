import { ErrorKey, Locale, translate, TranslationParams } from "../i18n";
import { sourceLocale } from "../utils/constants";

export type SerializedError = {
  code: string;
  message: string;
  field?: string;
  params?: TranslationParams;
};

// Errors carry a catalog key, not text: the error handler translates it into
// the request's language, and clients can translate `code` themselves.
export abstract class CustomError extends Error {
  abstract statusCode: number;

  constructor(
    public readonly code: ErrorKey,
    public readonly params: TranslationParams = {},
  ) {
    // The English text keeps server logs readable.
    super(translate(sourceLocale, `errors:${code}`, params));
  }

  serializeError(locale: Locale): SerializedError[] {
    const hasParams = Object.keys(this.params).length > 0;
    return [
      {
        code: this.code,
        message: translate(locale, `errors:${this.code}`, this.params),
        ...(hasParams && { params: this.params }),
      },
    ];
  }
}

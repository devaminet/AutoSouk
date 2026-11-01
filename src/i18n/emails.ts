import { rtlLocales } from "../utils/constants";
import { Locale, translate, TranslationKey, TranslationParams } from ".";

export type EmailSubjectKey = "register.subject" | "forgot_password.subject";

/**
 * What every email template gets: `t` for its text (keys of the emails
 * namespace), plus the `lang` and `dir` of the recipient's language.
 * Templates print with `<%= %>`, so translated text is HTML-escaped there.
 */
export const emailTemplateContext = (locale: Locale) => ({
  locale,
  dir: rtlLocales.includes(locale) ? "rtl" : "ltr",
  t: (key: string, params?: TranslationParams) =>
    translate(locale, `emails:${key}` as TranslationKey, params),
});

export const emailSubject = (locale: Locale, key: EmailSubjectKey) =>
  translate(locale, `emails:${key}`);

import i18next, { ParseKeys, TOptions } from "i18next";
import { sourceLocale, supportedLocales } from "../utils/constants";
import { apiDefaultLocale, Locale } from "./config";
import { Namespace, namespaces, resources } from "./resources";

export { apiDefaultLocale, localeSchema, Locale } from "./config";

export type TranslationKey = ParseKeys<Namespace[]>;

export type ErrorKey = ParseKeys<"errors">;

export type MessageKey = ParseKeys<"messages">;

export type TranslationParams = Record<string, string | number>;

const i18n = i18next.createInstance();

// Resources are bundled, so `initAsync: false` makes `translate` usable as soon
// as this module is imported. Missing keys fall back to the English source.
void i18n.init({
  resources,
  ns: namespaces,
  defaultNS: "errors",
  lng: apiDefaultLocale,
  fallbackLng: sourceLocale,
  supportedLngs: supportedLocales,
  initAsync: false,
  returnEmptyString: false,
  // Responses are JSON; HTML escaping is the job of whatever renders HTML.
  interpolation: { escapeValue: false },
});

const pluralSuffix = /_(zero|one|two|few|many|other)$/;

const collectKeys = (messages: object, prefix = ""): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`.replace(pluralSuffix, "")]
      : collectKeys(value, `${prefix}${key}.`),
  );

const errorKeys: ReadonlySet<string> = new Set(
  collectKeys(resources[sourceLocale].errors),
);

export const isErrorKey = (value: string): value is ErrorKey =>
  errorKeys.has(value);

// `translate` is the typed entry point (keys and locales are checked here);
// i18next's own overloads cannot resolve a union this large, so the call
// below goes through its untyped string form.
const translateKey = i18n.t.bind(i18n) as (
  key: string,
  options: TOptions,
) => string;

export const translate = (
  locale: Locale,
  key: TranslationKey,
  params: TranslationParams = {},
): string => translateKey(key, { ...params, lng: locale });

// A success message for a response body: the stable `code` lets clients
// translate it themselves, and `message` is already in the request's locale.
export const localizedMessage = (
  locale: Locale,
  code: MessageKey,
  params: TranslationParams = {},
) => ({
  code,
  message: translate(locale, `messages:${code}`, params),
  ...(Object.keys(params).length > 0 && { params }),
});

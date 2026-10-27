import i18next, { ParseKeys } from "i18next";
import { sourceLocale, supportedLocales } from "../utils/constants";
import { apiDefaultLocale, Locale } from "./config";
import { Namespace, namespaces, resources } from "./resources";

export { apiDefaultLocale, localeSchema, Locale } from "./config";

export type TranslationKey = ParseKeys<Namespace[]>;

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

export const translate = (
  locale: Locale,
  key: TranslationKey,
  params: TranslationParams = {},
): string => i18n.t(key, { ...params, lng: locale });

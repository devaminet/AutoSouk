import { NextFunction, Request, Response } from "express";
import { apiDefaultLocale, Locale, localeSchema } from "../i18n";
import { supportedLocales } from "../utils/constants";

// The default goes first so that `Accept-Language: *` and ties resolve to it.
const negotiationOrder: Locale[] = [
  apiDefaultLocale,
  ...supportedLocales.filter((locale) => locale !== apiDefaultLocale),
];

// `?lang=` wins over `Accept-Language`, then the API default applies. Both are
// preferences, so an unsupported value falls through instead of failing.
const resolveLocale = (req: Request): Locale => {
  const fromQuery = localeSchema.safeParse(req.query.lang);
  if (fromQuery.success) {
    return fromQuery.data;
  }

  const negotiated = localeSchema.safeParse(
    req.acceptsLanguages(negotiationOrder),
  );
  return negotiated.success ? negotiated.data : apiDefaultLocale;
};

export default (req: Request, res: Response, next: NextFunction) => {
  req.locale = resolveLocale(req);
  res.setHeader("Content-Language", req.locale);
  res.vary("Accept-Language");
  next();
};

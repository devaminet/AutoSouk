import { z } from "zod";
import { defaultLocale, supportedLocales } from "../utils/constants";

export const localeSchema = z.enum(supportedLocales);

export type Locale = z.infer<typeof localeSchema>;

// An empty DEFAULT_LOCALE (as in .env-sample) means "not set"; any other value
// that is not a supported locale stops the server at boot.
export const parseDefaultLocale = (value: string | undefined): Locale =>
  localeSchema.default(defaultLocale).parse(value || undefined);

export const apiDefaultLocale = parseDefaultLocale(process.env.DEFAULT_LOCALE);

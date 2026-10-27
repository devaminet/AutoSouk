import arEmails from "./locales/ar/emails.json";
import arEnums from "./locales/ar/enums.json";
import arErrors from "./locales/ar/errors.json";
import arPdf from "./locales/ar/pdf.json";
import enEmails from "./locales/en/emails.json";
import enEnums from "./locales/en/enums.json";
import enErrors from "./locales/en/errors.json";
import enPdf from "./locales/en/pdf.json";
import frEmails from "./locales/fr/emails.json";
import frEnums from "./locales/fr/enums.json";
import frErrors from "./locales/fr/errors.json";
import frPdf from "./locales/fr/pdf.json";

export const namespaces = ["errors", "enums", "emails", "pdf"] as const;

export type Namespace = (typeof namespaces)[number];

// English is the source catalog: it defines the keys and their types, and the
// catalog test checks that French and Arabic have exactly the same keys.
export const sourceResources = {
  errors: enErrors,
  enums: enEnums,
  emails: enEmails,
  pdf: enPdf,
} satisfies Record<Namespace, object>;

export const resources = {
  en: sourceResources,
  fr: { errors: frErrors, enums: frEnums, emails: frEmails, pdf: frPdf },
  ar: { errors: arErrors, enums: arEnums, emails: arEmails, pdf: arPdf },
} satisfies Record<string, Record<Namespace, object>>;

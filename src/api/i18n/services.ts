import { Locale } from "../../i18n";
import { ClientNamespace, resources } from "../../i18n/resources";

export const getCatalog = (locale: Locale, namespace: ClientNamespace) =>
  resources[locale][namespace];

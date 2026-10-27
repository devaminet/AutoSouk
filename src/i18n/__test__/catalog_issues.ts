const pluralCategories = ["zero", "one", "two", "few", "many", "other"];

const pluralSuffix = new RegExp(`_(${pluralCategories.join("|")})$`);

const placeholderPattern = /\{\{\s*([\w.]+)[^}]*\}\}/g;

type Entry = {
  pluralForms: Set<string>;
  placeholders: Set<string>;
};

type LocaleCatalog = Record<string, object>;

const flatten = (
  value: object,
  prefix: string,
  issues: string[],
): Map<string, string> => {
  const flat = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      flat.set(path, child);
    } else if (child !== null && typeof child === "object") {
      flatten(child, path, issues).forEach((text, nested) =>
        flat.set(nested, text),
      );
    } else {
      issues.push(`${path} is not a string`);
    }
  }
  return flat;
};

// Groups the plural forms of a key (`cars_one`, `cars_other`) under its base
// key, the way i18next resolves `t("cars", { count })`.
const toEntries = (
  locale: string,
  catalog: LocaleCatalog,
  issues: string[],
): Map<string, Entry> => {
  const entries = new Map<string, Entry>();
  for (const [namespace, messages] of Object.entries(catalog)) {
    const flatIssues: string[] = [];
    const flat = flatten(messages, "", flatIssues);
    flatIssues.forEach((issue) =>
      issues.push(`${locale}: ${namespace}:${issue}`),
    );

    for (const [key, text] of flat) {
      const plural = key.match(pluralSuffix);
      const base = `${namespace}:${plural ? key.slice(0, plural.index) : key}`;
      const entry = entries.get(base) ?? {
        pluralForms: new Set<string>(),
        placeholders: new Set<string>(),
      };
      if (plural) entry.pluralForms.add(plural[1]);
      for (const [, name] of text.matchAll(placeholderPattern)) {
        entry.placeholders.add(name);
      }
      if (text.trim() === "")
        issues.push(`${locale}: ${namespace}:${key} is empty`);
      entries.set(base, entry);
    }
  }
  return entries;
};

const placeholderList = (entry: Entry): string =>
  [...entry.placeholders]
    // A plural form may leave out the count ("no cars" for `_zero`).
    .filter((name) => !(entry.pluralForms.size > 0 && name === "count"))
    .sort()
    .join(", ") || "none";

/**
 * Lists every difference between the source catalog and the other locales:
 * missing or extra keys, empty messages, different placeholders, and plural
 * keys without every plural form the locale needs (Arabic needs six).
 */
export const findCatalogIssues = (
  catalogs: Record<string, LocaleCatalog>,
  source: string,
): string[] => {
  const issues: string[] = [];
  const sourceEntries = toEntries(source, catalogs[source], issues);

  for (const [locale, catalog] of Object.entries(catalogs)) {
    const entries =
      locale === source ? sourceEntries : toEntries(locale, catalog, issues);
    const requiredForms = new Intl.PluralRules(locale).resolvedOptions()
      .pluralCategories;

    for (const [key, sourceEntry] of sourceEntries) {
      const entry = entries.get(key);
      if (!entry) {
        issues.push(`${locale}: ${key} is missing`);
        continue;
      }

      const isPlural = sourceEntry.pluralForms.size > 0;
      if (isPlural !== entry.pluralForms.size > 0) {
        issues.push(
          `${locale}: ${key} must ${isPlural ? "" : "not "}have plural forms like ${source}`,
        );
      }
      if (isPlural && entry.pluralForms.size > 0) {
        requiredForms
          .filter((form) => !entry.pluralForms.has(form))
          .forEach((form) =>
            issues.push(`${locale}: ${key} is missing plural form _${form}`),
          );
      }

      const expected = placeholderList(sourceEntry);
      const actual = placeholderList(entry);
      if (actual !== expected) {
        issues.push(
          `${locale}: ${key} uses placeholders ${actual}, ${source} uses ${expected}`,
        );
      }
    }

    for (const key of entries.keys()) {
      if (!sourceEntries.has(key)) {
        issues.push(`${locale}: ${key} is not in ${source}`);
      }
    }
  }
  return issues;
};

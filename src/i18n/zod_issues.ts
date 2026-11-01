import { ZodIssue, ZodIssueCode, ZodParsedType } from "zod";
import { ErrorKey, isErrorKey, TranslationParams } from ".";

export type TranslatedIssue = { code: ErrorKey; params: TranslationParams };

// Schemas pass catalog keys as Zod messages; this keeps them type-checked.
export const messageKey = (key: ErrorKey): ErrorKey => key;

// A validation issue raised outside Zod (for example after a database check),
// in the same shape as Zod's own issues.
export const customIssue = (
  path: (string | number)[],
  key: ErrorKey,
  params?: TranslationParams,
): ZodIssue => ({ code: ZodIssueCode.custom, message: key, path, params });

const invalidTypeKeys: Partial<Record<string, ErrorKey>> = {
  [ZodParsedType.string]: "validation.invalid_type.string",
  [ZodParsedType.number]: "validation.invalid_type.number",
  [ZodParsedType.integer]: "validation.invalid_type.integer",
  [ZodParsedType.boolean]: "validation.invalid_type.boolean",
  [ZodParsedType.array]: "validation.invalid_type.array",
  [ZodParsedType.object]: "validation.invalid_type.object",
  [ZodParsedType.date]: "validation.invalid_type.date",
};

const invalidStringKeys: Partial<Record<string, ErrorKey>> = {
  email: "validation.invalid_email",
  url: "validation.invalid_url",
  datetime: "validation.invalid_datetime",
  date: "validation.invalid_date",
  time: "validation.invalid_datetime",
};

type SizeIssue = Extract<
  ZodIssue,
  { code: typeof ZodIssueCode.too_small | typeof ZodIssueCode.too_big }
>;

const formatDate = (value: number) =>
  new Date(value).toISOString().slice(0, 10);

const sizeIssue = (issue: SizeIssue): TranslatedIssue => {
  const isMin = issue.code === ZodIssueCode.too_small;
  const bound = Number(isMin ? issue.minimum : issue.maximum);

  switch (issue.type) {
    case "string":
    case "array":
    case "set": {
      const kind = issue.type === "string" ? "string" : "array";
      const size = issue.exact ? "length" : isMin ? "min" : "max";
      return { code: `validation.${kind}_${size}`, params: { count: bound } };
    }
    case "date":
      return isMin
        ? {
            code: "validation.date_min",
            params: { minimum: formatDate(bound) },
          }
        : {
            code: "validation.date_max",
            params: { maximum: formatDate(bound) },
          };
    default:
      if (isMin) {
        return {
          code: issue.inclusive
            ? "validation.number_min"
            : "validation.number_gt",
          params: { minimum: bound },
        };
      }
      return {
        code: issue.inclusive
          ? "validation.number_max"
          : "validation.number_lt",
        params: { maximum: bound },
      };
  }
};

const genericIssue = (issue: ZodIssue): TranslatedIssue => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        return { code: "validation.required", params: {} };
      }
      return {
        code:
          invalidTypeKeys[issue.expected] ?? "validation.invalid_type.other",
        params: {},
      };
    case ZodIssueCode.not_finite:
      return { code: "validation.invalid_type.number", params: {} };
    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_union_discriminator:
      return {
        code: "validation.invalid_option",
        params: { options: issue.options.map(String).join(", ") },
      };
    case ZodIssueCode.invalid_literal:
      return {
        code: "validation.invalid_option",
        params: { options: String(issue.expected) },
      };
    case ZodIssueCode.invalid_string: {
      const validation =
        typeof issue.validation === "string" ? issue.validation : "";
      return {
        code: invalidStringKeys[validation] ?? "validation.invalid_format",
        params: {},
      };
    }
    case ZodIssueCode.invalid_date:
      return { code: "validation.invalid_date", params: {} };
    case ZodIssueCode.too_small:
    case ZodIssueCode.too_big:
      return sizeIssue(issue);
    case ZodIssueCode.not_multiple_of:
      return {
        code: "validation.not_multiple_of",
        params: { multipleOf: Number(issue.multipleOf) },
      };
    case ZodIssueCode.unrecognized_keys:
      return {
        code: "validation.unrecognized_keys",
        params: { keys: issue.keys.join(", ") },
      };
    default:
      return { code: "validation.invalid", params: {} };
  }
};

const customParams = (issue: ZodIssue): TranslationParams =>
  issue.code === ZodIssueCode.custom
    ? Object.fromEntries(
        Object.entries(issue.params ?? {}).filter(
          (entry): entry is [string, string | number] =>
            typeof entry[1] === "string" || typeof entry[1] === "number",
        ),
      )
    : {};

/**
 * Maps a Zod issue to a catalog key and its params. A message that is a
 * catalog key (see `messageKey`) wins; any other message, including Zod's own
 * English defaults, is replaced by the generic key for the issue.
 */
export const translateIssue = (issue: ZodIssue): TranslatedIssue => {
  const generic = genericIssue(issue);
  const params = { ...generic.params, ...customParams(issue) };
  return isErrorKey(issue.message)
    ? { code: issue.message, params }
    : { code: generic.code, params };
};

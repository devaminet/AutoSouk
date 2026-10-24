import { z } from "zod";
import type { VersionPrecondition } from "./services";

export const updateSettingsSchema = z.object(
  {
    values: z
      .record(z.string(), z.unknown(), {
        required_error: "Values are required",
        invalid_type_error: "Values must be an object of setting keys",
      })
      .refine((values) => Object.keys(values).length > 0, {
        message: "At least one setting is required",
      }),
  },
  { required_error: "Body with values is required" },
);

export const settingKeyParamSchema = z.object({
  key: z.string().min(1, "Setting key is required"),
});

const entityTagPattern = /^(W\/)?"(\d{1,15})"$/;

// If-Match is "*" or a comma separated list of entity tags. Weak tags never
// match (RFC 9110 uses strong comparison), so they are parsed but dropped.
export const ifMatchHeaderSchema = z
  .string()
  .optional()
  .transform((header, ctx): VersionPrecondition => {
    if (header === undefined) {
      return undefined;
    }
    const tags = header.split(",").map((tag) => tag.trim());
    if (tags.length === 1 && tags[0] === "*") {
      return "any";
    }

    const versions: number[] = [];
    for (const tag of tags) {
      const match = entityTagPattern.exec(tag);
      if (!match) {
        ctx.addIssue({
          code: "custom",
          message: 'If-Match must be "*" or quoted settings versions',
        });
        return z.NEVER;
      }
      if (!match[1]) {
        versions.push(Number(match[2]));
      }
    }
    return versions;
  });

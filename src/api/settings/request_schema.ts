import { z } from "zod";

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

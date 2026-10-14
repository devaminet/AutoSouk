import { z } from "zod";

const megabyte = 1024 * 1024;
// S3/MinIO presigned urls are valid for at most 7 days.
const maxPresignedExpirySeconds = 7 * 24 * 60 * 60;

type SettingDefinition<S extends z.ZodTypeAny> = {
  schema: S;
  defaultValue: z.infer<S>;
  // Public settings are exposed unauthenticated to clients (GET /api/settings/public).
  isPublic: boolean;
  description: string;
};

// Ties the default to the schema so a wrong default fails to compile.
const defineSetting = <S extends z.ZodTypeAny>(
  definition: SettingDefinition<S>,
) => definition;

const extensionListSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9]{1,10}$/,
        "Extensions must be 1 to 10 letters or digits",
      ),
  )
  .min(1, "At least one extension is required")
  .max(20)
  .refine((list) => new Set(list).size === list.length, {
    message: "Extensions must be unique",
  });

const byteSizeSchema = (maxBytes: number) =>
  z
    .number()
    .int()
    .min(1024, "Size must be at least 1KB")
    .max(maxBytes, `Size must be at most ${maxBytes} bytes`);

const expirySecondsSchema = z
  .number()
  .int()
  .min(60, "Expiry must be at least 60 seconds")
  .max(maxPresignedExpirySeconds, "Expiry must be at most 7 days");

export const settingDefinitions = {
  "uploads.allowedImageExtensions": defineSetting({
    schema: extensionListSchema,
    defaultValue: ["jpg", "jpeg", "png", "webp"],
    isPublic: true,
    description: "File extensions accepted for images.",
  }),
  "uploads.allowedVideoExtensions": defineSetting({
    schema: extensionListSchema,
    defaultValue: ["mp4"],
    isPublic: true,
    description: "File extensions accepted for car videos.",
  }),
  "uploads.profileImage.maxSizeBytes": defineSetting({
    schema: byteSizeSchema(100 * megabyte),
    defaultValue: 10 * megabyte,
    isPublic: true,
    description: "Maximum profile image size in bytes.",
  }),
  "uploads.profileImage.uploadExpirySeconds": defineSetting({
    schema: expirySecondsSchema,
    defaultValue: 5 * 60,
    isPublic: true,
    description: "How long a profile image upload policy stays valid.",
  }),
  "uploads.carImage.maxSizeBytes": defineSetting({
    schema: byteSizeSchema(100 * megabyte),
    defaultValue: 10 * megabyte,
    isPublic: true,
    description: "Maximum car image size in bytes.",
  }),
  "uploads.carVideo.maxSizeBytes": defineSetting({
    // a single S3/MinIO POST upload is limited to 5GB
    schema: byteSizeSchema(5 * 1024 * megabyte),
    defaultValue: 50 * megabyte,
    isPublic: true,
    description: "Maximum car video size in bytes.",
  }),
  "uploads.carMedia.uploadExpirySeconds": defineSetting({
    schema: expirySecondsSchema,
    defaultValue: 15 * 60,
    isPublic: true,
    description: "How long a car media upload policy stays valid.",
  }),
  "listings.car.minYear": defineSetting({
    schema: z.number().int().min(1886).max(2100),
    defaultValue: 1950,
    isPublic: true,
    description: "Oldest car year accepted on a listing.",
  }),
  "listings.car.maxYearsAhead": defineSetting({
    schema: z.number().int().min(0).max(5),
    defaultValue: 1,
    isPublic: true,
    description:
      "How many years after the current year a car model year may be.",
  }),
  "listings.car.minDoors": defineSetting({
    schema: z.number().int().min(1).max(20),
    defaultValue: 1,
    isPublic: true,
    description: "Minimum doors number for a car.",
  }),
  "listings.car.maxDoors": defineSetting({
    schema: z.number().int().min(1).max(20),
    defaultValue: 9,
    isPublic: true,
    description: "Maximum doors number for a car.",
  }),
  "auth.emailTokenExpirationMinutes": defineSetting({
    schema: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    defaultValue: 5,
    isPublic: false,
    description:
      "Lifetime of email verification and password reset links, in minutes.",
  }),
} as const;

export type SettingKey = keyof typeof settingDefinitions;

export type SettingValues = {
  [K in SettingKey]: z.infer<(typeof settingDefinitions)[K]["schema"]>;
};

export const settingKeys = Object.keys(settingDefinitions) as SettingKey[];

export const isSettingKey = (key: string): key is SettingKey =>
  Object.prototype.hasOwnProperty.call(settingDefinitions, key);

export type SettingRuleViolation = { keys: SettingKey[]; message: string };

// Constraints spanning several settings, checked on the merged values.
const settingRules: ((values: SettingValues) => SettingRuleViolation | null)[] =
  [
    (values) =>
      values["listings.car.minDoors"] <= values["listings.car.maxDoors"]
        ? null
        : {
            keys: ["listings.car.minDoors", "listings.car.maxDoors"],
            message: "Minimum doors must not be greater than maximum doors",
          },
    (values) => {
      const images = new Set(values["uploads.allowedImageExtensions"]);
      const shared = values["uploads.allowedVideoExtensions"].filter((ext) =>
        images.has(ext),
      );
      return shared.length === 0
        ? null
        : {
            keys: [
              "uploads.allowedImageExtensions",
              "uploads.allowedVideoExtensions",
            ],
            message: `Extensions cannot be both image and video: ${shared.join(", ")}`,
          };
    },
  ];

export const findRuleViolations = (
  values: SettingValues,
): SettingRuleViolation[] =>
  settingRules
    .map((rule) => rule(values))
    .filter((violation): violation is SettingRuleViolation => !!violation);

export const getDefaultSettings = (): SettingValues =>
  Object.fromEntries(
    settingKeys.map((key) => [key, settingDefinitions[key].defaultValue]),
  ) as SettingValues;

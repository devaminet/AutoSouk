import { z } from "zod";
import { listingStatusEnum } from "../../db/schema/listing";
import { messageKey } from "../../i18n/zod_issues";
import { allowedFileTypes, getFileType } from "../../utils/functions";
import {
  maxCarEquipmentCount,
  maxCarMediaCount,
  minCarImageCount,
} from "../../utils/constants";

export const createListingSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const minCarYear = 1950;

const idSchema = z.number().int().positive();

const carMediaNameSchema = z.string().refine(
  (name) => !!getFileType(name),
  (filename) => ({
    message: messageKey("validation.file_type"),
    params: { filename, allowed: allowedFileTypes },
  }),
);

const hasUniqueNames = (files: { name: string }[]) =>
  new Set(files.map((file) => file.name.toLowerCase())).size === files.length;

const hasUniqueIds = (ids: number[]) => new Set(ids).size === ids.length;

const uniqueFileNames = {
  message: messageKey("validation.unique_file_names"),
  path: [],
};

const maxCarMediaFiles = messageKey("media.max_files");

export const createCarSchema = z.object({
  makeId: idSchema,
  modelId: idSchema,
  carburantId: idSchema,
  originId: idSchema,
  stateId: idSchema,
  price: z.number().int().positive(),
  year: z
    .number()
    .int()
    .min(minCarYear)
    .refine((year) => year <= new Date().getFullYear() + 1, {
      message: messageKey("validation.year_in_future"),
    }),
  ownersCount: z.number().int().min(0),
  cityId: idSchema,
  distance: z.string().trim().min(1),
  transmission: z.enum(["manual", "automatic"]),
  fiscalPower: z.number().int().positive(),
  doorsNumber: z.number().int().min(1).max(9),
  equipmentIds: z
    .array(idSchema)
    .max(maxCarEquipmentCount)
    .refine(hasUniqueIds, { message: messageKey("validation.unique_ids") })
    .optional(),
  files: z
    .array(
      z.object({
        name: carMediaNameSchema,
        isPrimary: z.boolean(),
      }),
    )
    .max(maxCarMediaCount, maxCarMediaFiles)
    .refine(
      (files) =>
        files.filter((file) => getFileType(file.name) === "image").length >=
        minCarImageCount,
      {
        message: messageKey("media.min_images"),
        params: { count: minCarImageCount },
        path: [],
      },
    )
    .refine((files) => files.filter((file) => file.isPrimary).length === 1, {
      message: messageKey("media.one_primary"),
      path: [],
    })
    .refine(
      (files) =>
        files.every(
          (file) => !file.isPrimary || getFileType(file.name) === "image",
        ),
      { message: messageKey("media.primary_file_not_image"), path: [] },
    )
    .refine(hasUniqueNames, uniqueFileNames),
});

// Accepts equipmentIds=3,7 as well as equipmentIds=3&equipmentIds=7.
const splitIdList = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }
  const parts = Array.isArray(value) ? value : [value];
  return parts.flatMap((part) =>
    typeof part === "string"
      ? part
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "")
      : part,
  );
};

const equipmentIdsQuerySchema = z.preprocess(
  splitIdList,
  z
    .array(z.coerce.number().int().positive())
    .max(maxCarEquipmentCount)
    .transform((ids) => [...new Set(ids)])
    .optional(),
);

export const getListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  makeId: z.coerce.number().int().positive().optional(),
  modelId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  equipmentIds: equipmentIdsQuerySchema,
  sort: z
    .enum(["price_asc", "price_desc", "newest", "oldest"])
    .default("newest"),
});

export const getMyListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(listingStatusEnum.enumValues).optional(),
});

export const getPendingListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const rejectListingSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const addCarMediaSchema = z.object({
  files: z
    .array(z.object({ name: carMediaNameSchema }))
    .min(1)
    .max(maxCarMediaCount, maxCarMediaFiles)
    .refine(hasUniqueNames, uniqueFileNames),
});

export const deleteCarMediaSchema = z.object({
  mediaIds: z
    .array(idSchema)
    .min(1)
    .max(maxCarMediaCount)
    .refine(hasUniqueIds, { message: messageKey("validation.unique_ids") }),
});

export const attachListingParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listingMediaParamSchema = attachListingParamSchema.extend({
  mediaId: z.coerce.number().int().positive(),
});

export const updateListingSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    car: createCarSchema.omit({ files: true }).partial().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      (data.car !== undefined && Object.keys(data.car).length > 0),
    { message: messageKey("validation.no_fields") },
  );

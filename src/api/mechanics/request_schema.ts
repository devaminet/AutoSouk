import { z } from "zod";
import { messageKey } from "../../i18n/zod_issues";
import { allowedImageTypes, getFileType } from "../../utils/functions";

// The name of an image on the mechanic's device. The API stores it under a
// name of its own, so it never overwrites another file.
const imageNameSchema = z.string().refine(
  (filename) => getFileType(filename) === "image",
  (filename) => ({
    message: messageKey("validation.image_type"),
    params: { filename, allowed: allowedImageTypes },
  }),
);

export const createMechanicSchema = z.object({
  name: z.string().trim().min(1),
  cityId: z.number().int().positive(),
  address: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  inspectionPrice: z.number().int().nonnegative().optional(),
  profileImageFilename: imageNameSchema.optional(),
});

// null clears an optional detail, or removes the profile image.
export const updateMechanicSchema = createMechanicSchema
  .extend({
    description: z.string().trim().nullable(),
    phone: z.string().trim().nullable(),
    inspectionPrice: z.number().int().nonnegative().nullable(),
    profileImageFilename: imageNameSchema.nullable(),
  })
  .partial();

export const mechanicIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const garageImageIdParamSchema = z.object({
  imageId: z.coerce.number().int().positive(),
});

export const addGarageImagesSchema = z.object({
  filenames: z.array(imageNameSchema).min(1),
});

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

export const listingMechanicsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

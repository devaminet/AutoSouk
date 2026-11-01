import { z } from "zod";
import { messageKey } from "../../i18n/zod_issues";
import { allowedImageTypes, getFileType } from "../../utils/functions";

export const createMechanicSchema = z.object({
  name: z.string(),
  cityId: z.number().int().positive(),
  address: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().optional(),
  phone: z.string().optional(),
  inspectionPrice: z.number().int().nonnegative().optional(),
  profileImageFilename: z.string().optional(),
});

export const updateMechanicSchema = createMechanicSchema.partial();

export const mechanicIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const garageImageIdParamSchema = z.object({
  imageId: z.coerce.number().int().positive(),
});

export const addGarageImagesSchema = z.object({
  filenames: z.array(
    z.string().refine(
      (filename) => getFileType(filename) === "image",
      (filename) => ({
        message: messageKey("validation.image_type"),
        params: { filename, allowed: allowedImageTypes },
      }),
    ),
  ),
});

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

export const listingMechanicsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

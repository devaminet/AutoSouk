import { z } from "zod";
import { allowedFileTypes, getFileType } from "../../utils/functions";

export const createMechanicSchema = z.object(
  {
    name: z.string({
      required_error: "Mechanic name is required",
      invalid_type_error: "Mechanic name must be a text",
    }),
    cityId: z
      .number({
        required_error: "City is required",
        invalid_type_error: "City must be a number",
      })
      .int()
      .positive("City must be a positive number"),
    address: z.string({
      required_error: "Address is required",
      invalid_type_error: "Address must be a text",
    }),
    latitude: z
      .number({
        required_error: "Latitude is required",
        invalid_type_error: "Latitude must be a number",
      })
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90"),
    longitude: z
      .number({
        required_error: "Longitude is required",
        invalid_type_error: "Longitude must be a number",
      })
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180"),
    description: z
      .string({
        invalid_type_error: "Description must be a text",
      })
      .optional(),
    phone: z
      .string({
        invalid_type_error: "Phone must be a text",
      })
      .optional(),
    inspectionPrice: z
      .number({
        invalid_type_error: "Inspection price must be a number",
      })
      .int()
      .nonnegative("Inspection price must not be negative")
      .optional(),
    profileImageFilename: z
      .string({
        invalid_type_error: "Profile image filename must be a text",
      })
      .optional(),
  },
  { required_error: "Mechanic details are required" },
);

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
        message: `${filename} has an invalid image type, allowed types: ${allowedFileTypes}`,
      }),
    ),
  ),
});

export const updateStatusSchema = z.object(
  {
    isActive: z.boolean({
      required_error: "Active status is required",
      invalid_type_error: "Active status must be a boolean",
    }),
  },
  { required_error: "Mechanic status is required" },
);

export const listingMechanicsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

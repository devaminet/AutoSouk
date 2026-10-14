import { z } from "zod";
import { describeAllowedExtensions, getFileType } from "../../utils/functions";
import { getSetting } from "../../settings/store";

export const createListingSchema = z.object(
  {
    title: z.string({
      required_error: "Title is required",
      invalid_type_error: "Title must be a text",
    }),
    description: z.string({
      required_error: "Description is required",
      invalid_type_error: "Description must be a text",
    }),
  },
  { required_error: "Body with title and description is required" },
);

// Bounds come from admin settings and are read on every validation, so a
// change applies without a restart.
const validateCarYear = (year: number, ctx: z.RefinementCtx) => {
  const minYear = getSetting("listings.car.minYear");
  const maxYear =
    new Date().getFullYear() + getSetting("listings.car.maxYearsAhead");
  if (year < minYear) {
    ctx.addIssue({
      code: "custom",
      message: `Year must be ${minYear} or later`,
    });
  } else if (year > maxYear) {
    ctx.addIssue({
      code: "custom",
      message: `Year must be ${maxYear} or earlier`,
    });
  }
};

const validateDoorsNumber = (doors: number, ctx: z.RefinementCtx) => {
  const minDoors = getSetting("listings.car.minDoors");
  const maxDoors = getSetting("listings.car.maxDoors");
  if (doors < minDoors || doors > maxDoors) {
    ctx.addIssue({
      code: "custom",
      message: `Doors number must be between ${minDoors} and ${maxDoors}`,
    });
  }
};

export const createCarSchema = z.object(
  {
    makeId: z
      .number({
        required_error: "Car make is required",
        invalid_type_error: "Car make must be a number",
      })
      .int("Car make must be a whole number")
      .positive("Car make must be a valid ID"),
    modelId: z
      .number({
        required_error: "Car model is required",
        invalid_type_error: "Car model must be a number",
      })
      .int("Car model must be a whole number")
      .positive("Car model must be a valid ID"),
    carburantId: z
      .number({
        required_error: "Carburant is required",
        invalid_type_error: "Carburant must be a number",
      })
      .int("Carburant must be a whole number")
      .positive("Carburant must be a valid ID"),
    originId: z
      .number({
        required_error: "Origin is required",
        invalid_type_error: "Origin must be a number",
      })
      .int("Origin must be a whole number")
      .positive("Origin must be a valid ID"),
    stateId: z
      .number({
        required_error: "State is required",
        invalid_type_error: "State must be a number",
      })
      .int("State must be a whole number")
      .positive("State must be a valid ID"),
    price: z
      .number({
        required_error: "Price is required",
        invalid_type_error: "Price must be a number",
      })
      .int("Price must be a whole number")
      .positive("Price must be greater than 0"),
    year: z
      .number({
        required_error: "Year is required",
        invalid_type_error: "Year must be a number",
      })
      .int("Year must be a whole number")
      .superRefine(validateCarYear),
    ownersCount: z
      .number({
        required_error: "Owners count is required",
        invalid_type_error: "Owners count must be a number",
      })
      .int("Owners count must be a whole number")
      .min(0, "Owners count must not be negative"),
    cityId: z
      .number({
        required_error: "City is required",
        invalid_type_error: "City must be a number",
      })
      .int("City must be a whole number")
      .positive("City must be a valid ID"),
    distance: z
      .string({
        required_error: "Distance is required",
        invalid_type_error: "Distance must be a text",
      })
      .trim()
      .min(1, "Distance must not be empty"),
    transmission: z.enum(["manual", "automatic"], {
      message: "Transmission should be either manual or automatic",
    }),
    fiscalPower: z
      .number({
        required_error: "Fiscal power is required",
        invalid_type_error: "Fiscal power must be a number",
      })
      .int("Fiscal power must be a whole number")
      .positive("Fiscal power must be greater than 0"),
    doorsNumber: z
      .number({
        required_error: "Doors number is required",
        invalid_type_error: "Doors number must be a number",
      })
      .int("Doors number must be a whole number")
      .superRefine(validateDoorsNumber),
    files: z
      .array(
        z.object({
          name: z.string().refine(
            (name) => !!getFileType(name),
            (filename) => ({
              message: `${filename} has an invalid file type, allowed type: ${describeAllowedExtensions()}`,
            }),
          ),
          isPrimary: z.boolean(),
        }),
        {
          required_error: "At least one file is required.",
          invalid_type_error:
            "Files must be a list of objects in the format: { name: string, isPrimary: boolean }.",
        },
      )
      .refine((files) => files.filter((file) => file.isPrimary).length === 1, {
        message: "Exactly one file must be designated as primary.",
        path: [],
      })
      .refine(
        (files) =>
          new Set(files.map((file) => file.name.toLowerCase())).size ===
          files.length,
        {
          message: "File names must be unique.",
          path: [],
        },
      ),
  },
  {
    required_error: "Car details are required",
  },
);

export const getListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  makeId: z.coerce.number().int().positive().optional(),
  modelId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z
    .enum(["price_asc", "price_desc", "newest", "oldest"])
    .default("newest"),
});

export const attachListingParamSchema = z.object({
  id: z.coerce
    .number({
      required_error: "listingId is required",
      invalid_type_error: "listingId must be a number",
    })
    .int()
    .positive("listingId must be a positive number"),
});

export const updateListingSchema = z
  .object({
    title: z
      .string({ invalid_type_error: "Title must be a text" })
      .min(1, "Title cannot be empty")
      .optional(),
    description: z
      .string({ invalid_type_error: "Description must be a text" })
      .min(1, "Description cannot be empty")
      .optional(),
    car: createCarSchema.omit({ files: true }).partial().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      (data.car !== undefined && Object.keys(data.car).length > 0),
    { message: "At least one field to update is required" },
  );

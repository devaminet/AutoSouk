import { z } from "zod";
import { allowedFileTypes, getFileType } from "../../utils/functions";

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

export const createCarSchema = z.object(
  {
    makeId: z.number({
      required_error: "Car make is required",
      invalid_type_error: "Car make must be a number",
    }),
    modelId: z.number({
      required_error: "Car model is required",
      invalid_type_error: "Car model must be a number",
    }),
    carburantId: z.number({
      required_error: "Carburant is required",
      invalid_type_error: "Carburant must be a number",
    }),
    originId: z.number({
      required_error: "Origin is required",
      invalid_type_error: "Origin must be a number",
    }),
    stateId: z.number({
      required_error: "State is required",
      invalid_type_error: "State must be a number",
    }),
    price: z.number({
      required_error: "Price is required",
      invalid_type_error: "Price must be a number",
    }),
    year: z.number({
      required_error: "Year is required",
      invalid_type_error: "Year must be a number",
    }),
    ownersCount: z.number({
      required_error: "Owners count is required",
      invalid_type_error: "Owners count must be a number",
    }),
    city: z.string({
      required_error: "City is required",
      invalid_type_error: "City must be a text",
    }),
    distance: z.string({
      required_error: "Distance is required",
      invalid_type_error: "Distance must be a text",
    }),
    transmission: z.enum(["manual", "automatic"], {
      message: "Transmission should be either manual or automatic",
    }),
    fiscalPower: z.number({
      required_error: "Fiscal power is required",
      invalid_type_error: "Fiscal power must be a number",
    }),
    doorsNumber: z.number({
      required_error: "Doors number is required",
      invalid_type_error: "Doors number must be a number",
    }),
    files: z
      .array(
        z.object({
          name: z.string().refine(
            (name) => !!getFileType(name),
            (filename) => ({
              message: `${filename} has an invalid file type, allowed type: ${allowedFileTypes}`,
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
      }),
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
  city: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z
    .enum(["price_asc", "price_desc", "newest", "oldest"])
    .default("newest"),
});

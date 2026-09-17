import { z } from "zod";

export const createInspectionSchema = z.object(
  {
    carId: z
      .number({
        required_error: "Car is required",
        invalid_type_error: "Car must be a number",
      })
      .int()
      .positive("Car must be a positive number"),
    mechanicId: z
      .number({
        required_error: "Mechanic is required",
        invalid_type_error: "Mechanic must be a number",
      })
      .int()
      .positive("Mechanic must be a positive number"),
  },
  { required_error: "Inspection request details are required" },
);

export const inspectionIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateInspectionStatusSchema = z.object(
  {
    status: z.enum(["accepted", "rejected", "in_progress", "cancelled"], {
      required_error: "Status is required",
      invalid_type_error: "Status is invalid",
    }),
  },
  { required_error: "Status update details are required" },
);

const inspectionItemSchema = z.object({
  label: z.string({ required_error: "Item label is required" }),
  status: z.enum(["pass", "attention", "fail"], {
    required_error: "Item status is required",
  }),
  note: z.string().optional(),
});

const inspectionSectionSchema = z.object({
  category: z.enum([
    "exterior",
    "interior",
    "mechanical",
    "electrical",
    "under_vehicle",
    "road_test",
  ]),
  items: z.array(inspectionItemSchema).min(1, "Section needs at least one item"),
});

export const completeInspectionSchema = z.object(
  {
    matricule: z.string({
      required_error: "Matricule is required",
      invalid_type_error: "Matricule must be a text",
    }),
    vin: z
      .string({ invalid_type_error: "VIN must be a text" })
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must be 17 characters and exclude I, O and Q")
      .optional(),
    carteGriseNumber: z
      .string({ invalid_type_error: "Carte grise number must be a text" })
      .optional(),
    mileage: z
      .number({
        required_error: "Mileage is required",
        invalid_type_error: "Mileage must be a number",
      })
      .int()
      .nonnegative("Mileage must not be negative"),
    mileageConsistency: z.enum(
      ["consistent", "suspicious", "unverifiable"],
      { required_error: "Mileage consistency assessment is required" },
    ),
    mileageConsistencyNote: z
      .string({ invalid_type_error: "Mileage consistency note must be a text" })
      .optional(),
    firstRegistrationDate: z
      .string({ invalid_type_error: "First registration date must be a date" })
      .optional(),
    inspectedAt: z
      .string({ invalid_type_error: "Inspection date must be a date" })
      .datetime({ message: "Inspection date must be an ISO datetime" })
      .optional(),
    controleTechniqueValid: z.boolean({
      required_error: "Controle technique status is required",
      invalid_type_error: "Controle technique status must be a boolean",
    }),
    controleTechniqueExpiry: z
      .string({ invalid_type_error: "Controle technique expiry must be a date" })
      .optional(),
    vignetteValid: z.boolean({
      required_error: "Vignette status is required",
      invalid_type_error: "Vignette status must be a boolean",
    }),
    verdict: z.enum(["excellent", "good", "fair", "poor"], {
      required_error: "Verdict is required",
    }),
    overallScore: z
      .number({ required_error: "Overall score is required" })
      .int()
      .min(0, "Overall score must be between 0 and 100")
      .max(100, "Overall score must be between 0 and 100"),
    summary: z.string({ required_error: "Summary is required" }),
    sections: z
      .array(inspectionSectionSchema)
      .min(1, "At least one inspection section is required"),
    estimatedRepairCost: z
      .number({ invalid_type_error: "Estimated repair cost must be a number" })
      .int()
      .nonnegative()
      .optional(),
    photoFilenames: z.array(z.string()).optional(),
  },
  { required_error: "Inspection report details are required" },
);

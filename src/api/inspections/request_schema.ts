import { z } from "zod";
import { messageKey } from "../../i18n/zod_issues";

export const createInspectionSchema = z.object({
  carId: z.number().int().positive(),
  mechanicId: z.number().int().positive(),
});

export const inspectionIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateInspectionStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "in_progress", "cancelled"]),
});

const inspectionItemSchema = z.object({
  label: z.string(),
  status: z.enum(["pass", "attention", "fail"]),
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
  items: z.array(inspectionItemSchema).min(1),
});

export const completeInspectionSchema = z.object({
  matricule: z.string(),
  vin: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, messageKey("validation.vin_format"))
    .optional(),
  carteGriseNumber: z.string().optional(),
  mileage: z.number().int().nonnegative(),
  mileageConsistency: z.enum(["consistent", "suspicious", "unverifiable"]),
  mileageConsistencyNote: z.string().optional(),
  firstRegistrationDate: z.string().optional(),
  inspectedAt: z.string().datetime().optional(),
  controleTechniqueValid: z.boolean(),
  controleTechniqueExpiry: z.string().optional(),
  vignetteValid: z.boolean(),
  verdict: z.enum(["excellent", "good", "fair", "poor"]),
  overallScore: z.number().int().min(0).max(100),
  summary: z.string(),
  sections: z.array(inspectionSectionSchema).min(1),
  estimatedRepairCost: z.number().int().nonnegative().optional(),
  photoFilenames: z.array(z.string()).optional(),
});

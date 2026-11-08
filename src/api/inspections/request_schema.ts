import { z } from "zod";
import { localeSchema } from "../../i18n/config";
import { messageKey } from "../../i18n/zod_issues";

export const createInspectionSchema = z.object({
  carId: z.number().int().positive(),
  mechanicId: z.number().int().positive(),
  // The language of the report. The request's language when left out.
  reportLanguage: localeSchema.optional(),
});

export const inspectionIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateInspectionStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "in_progress", "cancelled"]),
});

export const inspectionItemStatusSchema = z.enum(["pass", "attention", "fail"]);

export const inspectionCategorySchema = z.enum([
  "exterior",
  "interior",
  "mechanical",
  "electrical",
  "under_vehicle",
  "road_test",
]);

const inspectionItemSchema = z.object({
  label: z.string(),
  status: inspectionItemStatusSchema,
  note: z.string().optional(),
});

const inspectionSectionSchema = z.object({
  category: inspectionCategorySchema,
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

// The mechanic's unfinished report: every field of the report is optional,
// and a checklist item may wait for its status.
export const reportDraftSchema = z.object({
  matricule: z.string().max(50).optional(),
  vin: z.string().max(50).optional(),
  carteGriseNumber: z.string().max(50).optional(),
  mileage: z.number().int().nonnegative().optional(),
  mileageConsistency: z
    .enum(["consistent", "suspicious", "unverifiable"])
    .optional(),
  mileageConsistencyNote: z.string().max(500).optional(),
  firstRegistrationDate: z.string().max(10).optional(),
  inspectedAt: z.string().datetime().optional(),
  controleTechniqueValid: z.boolean().optional(),
  controleTechniqueExpiry: z.string().max(10).optional(),
  vignetteValid: z.boolean().optional(),
  verdict: z.enum(["excellent", "good", "fair", "poor"]).optional(),
  overallScore: z.number().int().min(0).max(100).optional(),
  summary: z.string().max(5000).optional(),
  estimatedRepairCost: z.number().int().nonnegative().optional(),
  sections: z
    .array(
      z.object({
        category: inspectionCategorySchema,
        items: z
          .array(
            z.object({
              label: z.string().max(200),
              status: inspectionItemStatusSchema.nullable(),
              note: z.string().max(500).optional(),
            }),
          )
          .max(50),
      }),
    )
    .max(6)
    .optional(),
});

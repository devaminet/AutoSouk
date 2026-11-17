import { z } from "zod";
import {
  mechanicDocumentContentTypes,
  mechanicDocumentTypes,
  mechanicKinds,
} from "../../utils/constants";

export const chooseKindSchema = z.object({
  kind: z.enum(mechanicKinds),
});

export const startUploadSchema = z.object({
  type: z.enum(mechanicDocumentTypes),
  contentType: z.enum(mechanicDocumentContentTypes),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

// A date as YYYY-MM-DD, as a calendar date with no time zone.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value));

export const decideDocumentsSchema = z.object({
  // One decision for each pending document of the mechanic.
  decisions: z
    .array(
      z.object({
        documentId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        // Shown to the mechanic; required when rejecting.
        reason: z.string().trim().min(1).max(500).optional(),
        // The document's end date; required to approve a CIN or a patente.
        validUntil: calendarDate.optional(),
      }),
    )
    .min(1)
    .max(20),
});

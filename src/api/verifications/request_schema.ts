import { z } from "zod";
import { decideDocumentsSchema } from "../mechanic_verification/request_schema";

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

// The admin's decision on everything the user sent: the face check waiting,
// and one decision for each document waiting.
export const decideVerificationSchema = z
  .object({
    faceCheck: z
      .object({
        decision: z.enum(["approved", "rejected"]),
        // Shown to the user; required when rejecting.
        reason: z.string().trim().min(1).max(500).optional(),
      })
      .optional(),
    documents: decideDocumentsSchema.shape.decisions.optional(),
  })
  .refine((body) => body.faceCheck !== undefined || body.documents !== undefined);

import { z } from "zod";
import { identityVideoTypes } from "../../utils/constants";

export const startIdentityCheckSchema = z.object({
  // The format the browser records in.
  contentType: z.enum(identityVideoTypes),
});

export const identityCheckIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listIdentityChecksQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

export const decideIdentityCheckSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  // Shown to the user; required when rejecting.
  reason: z.string().trim().min(1).max(500).optional(),
});

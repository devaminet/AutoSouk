import { z } from "zod";
import { messageKey } from "../../i18n/zod_issues";
import { containsNsfwContent } from "../../utils/content_moderation";

const messageSchema = z
  .string()
  .max(1000)
  .refine((message) => !containsNsfwContent(message), {
    message: messageKey("validation.inappropriate_content"),
  })
  .optional();

const ratingSchema = z.number().int().min(1).max(5);

export const mechanicIdParamSchema = z.object({
  mechanicId: z.coerce.number().int().positive(),
});

export const createReviewSchema = z.object({
  rating: ratingSchema,
  message: messageSchema,
});

export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    message: messageSchema,
  })
  .refine((data) => data.rating !== undefined || data.message !== undefined, {
    message: messageKey("validation.no_fields"),
  });

export const reviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const mechanicRankingsQuerySchema = z.object({
  cityId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

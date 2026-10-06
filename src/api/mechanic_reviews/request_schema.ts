import { z } from "zod";
import { containsNsfwContent } from "../../utils/content_moderation";

const messageSchema = z
  .string({ invalid_type_error: "Review message must be a text" })
  .max(1000, "Review message must be at most 1000 characters")
  .refine((message) => !containsNsfwContent(message), {
    message: "Review message contains inappropriate content",
  })
  .optional();

export const mechanicIdParamSchema = z.object({
  mechanicId: z.coerce.number().int().positive(),
});

export const createReviewSchema = z.object(
  {
    rating: z
      .number({
        required_error: "Rating is required",
        invalid_type_error: "Rating must be a number",
      })
      .int("Rating must be a whole number")
      .min(1, "Rating must be between 1 and 5")
      .max(5, "Rating must be between 1 and 5"),
    message: messageSchema,
  },
  { required_error: "Review details are required" },
);

export const updateReviewSchema = z
  .object({
    rating: z
      .number({ invalid_type_error: "Rating must be a number" })
      .int("Rating must be a whole number")
      .min(1, "Rating must be between 1 and 5")
      .max(5, "Rating must be between 1 and 5")
      .optional(),
    message: messageSchema,
  })
  .refine((data) => data.rating !== undefined || data.message !== undefined, {
    message: "At least one field must be provided",
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

import { z } from "zod";

export const createFavoriteListingSchema = z.object({
  listingId: z.number().int().positive(),
});

export const removeFavoriteListingSchema = z.object({
  listingId: z.coerce.number().int().positive(),
});

export const favoriteListingSorts = [
  "recent",
  "price_asc",
  "price_desc",
] as const;

export const getFavoriteListingSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(12),
  // Only listings whose car has a completed inspection, or only the others.
  inspected: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z.enum(favoriteListingSorts).default("recent"),
  // Only listings whose car is in this city.
  cityId: z.coerce.number().int().positive().optional(),
});

export type QueryParams = z.infer<typeof getFavoriteListingSchema>;

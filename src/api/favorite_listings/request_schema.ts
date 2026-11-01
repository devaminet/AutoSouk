import { z } from "zod";

export const createFavoriteListingSchema = z.object({
  listingId: z.number(),
});

export const removeFavoriteListingSchema = z.object({
  listingId: z.coerce.number(),
});

export const getFavoriteListingSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(1).default(1),
});

export type QueryParams = z.infer<typeof getFavoriteListingSchema>;

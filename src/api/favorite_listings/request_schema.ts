import { z } from "zod";

export const createFavoriteListingSchema = z.object({
  listingId: z.number({
    required_error: "ListingId is required",
    invalid_type_error: "ListingId must be a number",
  }),
});

export const removeFavoriteListingSchema = z.object({
  listingId: z.coerce.number({
    coerce: true,
    required_error: "listing id parameter is required",
    invalid_type_error: "listing id must be a number",
  }),
});

export const getFavoriteListingSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(1).default(1),
});

export type QueryParams = z.infer<typeof getFavoriteListingSchema>;

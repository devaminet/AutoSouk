import { z } from "zod";

export const createOrRemoveFavoriteListingSchema = z.object({
  listingId: z.number({
    required_error: "ListingId is required",
    invalid_type_error: "ListingId must be a number",
  }),
});

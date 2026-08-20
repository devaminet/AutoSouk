import { db } from "../../db";
import { favoriteListings } from "../../db/schema/favorite_listing";

export const createFavoriteListing = async ({
  userId,
  listingId,
}: {
  userId: number;
  listingId: number;
}) => {
  const result = await db
    .insert(favoriteListings)
    .values({
      buyerId: userId,
      listingId,
    })
    .returning();

  return result[0];
};

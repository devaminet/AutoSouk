import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import {
  createFavoriteListing,
  favoriteListingIds,
  isApprovedListing,
  removeFavoriteListing,
  userFavoriteListings,
} from "./db";
import { QueryParams } from "./request_schema";

// Buyers can only keep listings they can see. Keeping one twice is not an
// error, so a repeated request is safe.
export const favorListing = async (data: {
  userId: number;
  listingId: number;
}) => {
  if (!(await isApprovedListing(data.listingId))) {
    throw new NotFoundError("listing.not_found");
  }
  let created: boolean;
  try {
    created = await createFavoriteListing(data);
  } catch (error) {
    throw new InternalServerError("favorite.add_failed");
  }
  return { listingId: data.listingId, created };
};

// Removing a listing that isn't kept is not an error, so a repeated request
// is safe. The count says whether one was removed.
export const removeFavorite = async (data: {
  userId: number;
  listingId: number;
}) => {
  try {
    return { count: await removeFavoriteListing(data) };
  } catch (error) {
    throw new InternalServerError("favorite.remove_failed");
  }
};

export const getUserFavoriteListings = async (
  userId: number,
  options: QueryParams,
) => {
  return await userFavoriteListings(userId, options);
};

export const getFavoriteListingIds = async (userId: number) => ({
  listingIds: await favoriteListingIds(userId),
});

import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import {
  createFavoriteListing,
  favoriteListingIds,
  isApprovedListing,
  removeFavoriteListing,
  findFavoriteListings,
} from "./db";
import { QueryParams } from "./request_schema";
import { signCarMediaLinks } from "../listings/services";

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

// A page of the buyer's saved listings, with signed media links, and how
// many are saved and inspected in all, whatever the filter.
export const getUserFavoriteListings = async (
  userId: number,
  query: QueryParams,
) => {
  const { page, limit } = query;
  const { listings, counts } = await findFavoriteListings(userId, query);
  await signCarMediaLinks(listings);
  return {
    listings,
    meta: {
      total: counts.total,
      page,
      limit,
      totalPages: Math.ceil(counts.total / limit),
    },
    counts: { all: counts.all, inspected: counts.inspected },
  };
};

export const getFavoriteListingIds = async (userId: number) => ({
  listingIds: await favoriteListingIds(userId),
});

import { z } from "zod";
import { BadRequestError } from "../../errors/bad-request-error";
import { InternalServerError } from "../../errors/internal-server-error";
import {
  createFavoriteListing,
  removeFavoriteListing,
  userFavoriteListings,
} from "./db";
import { QueryParams } from "./request-schema";

export const favorListing = async (data: {
  userId: number;
  listingId: number;
}) => {
  try {
    return await createFavoriteListing(data);
  } catch (error) {
    throw new InternalServerError(
      "Could not add this listing to your favorites",
    );
  }
};

export const removeFavorite = async (data: {
  userId: number;
  listingId: number;
}) => {
  let count: number;
  try {
    count = await removeFavoriteListing(data);
  } catch (error) {
    throw new InternalServerError(
      "Could not remove this listing from your favorites",
    );
  }

  if (count === 0) {
    throw new BadRequestError("This listing is not in your favorites list");
  }
  return { count };
};

export const getUserFavoriteListings = async (
  userId: number,
  options: QueryParams,
) => {
  return await userFavoriteListings(userId, options);
};

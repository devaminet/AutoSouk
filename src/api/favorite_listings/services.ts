import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import {
  createFavoriteListing,
  removeFavoriteListing,
  userFavoriteListings,
} from "./db";
import { QueryParams } from "./request_schema";

export const favorListing = async (data: {
  userId: number;
  listingId: number;
}) => {
  try {
    return await createFavoriteListing(data);
  } catch (error) {
    throw new InternalServerError("favorite.add_failed");
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
    throw new InternalServerError("favorite.remove_failed");
  }

  if (count === 0) {
    throw new BadRequestError("favorite.not_in_favorites");
  }
  return { count };
};

export const getUserFavoriteListings = async (
  userId: number,
  options: QueryParams,
) => {
  return await userFavoriteListings(userId, options);
};

import { InternalServerError } from "../../errors/internal-server-error";
import { createFavoriteListing } from "./db";

export const favorListing = async (data: {
  userId: number;
  listingId: number;
}) => {
  try {
    return await createFavoriteListing(data);
  } catch (error) {
    console.log(error);
    throw new InternalServerError(
      "Could not add this listing to your favorites",
    );
  }
};

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { favoriteListingsTable } from "../../db/schema/favorite_listing";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import { usersTable } from "../../db/schema/user";
import { carMediaTable } from "../../db/schema/car_media";
import { QueryParams } from "./request-schema";
import { generateGetPresignedUrl } from "../../utils/functions";
import { carBucketName } from "../../utils/constants";

export const createFavoriteListing = async ({
  userId,
  listingId,
}: {
  userId: number;
  listingId: number;
}) => {
  const result = await db
    .insert(favoriteListingsTable)
    .values({
      buyerId: userId,
      listingId,
    })
    .returning();

  return result[0];
};

export const removeFavoriteListing = async ({
  userId,
  listingId,
}: {
  userId: number;
  listingId: number;
}) => {
  const result = await db
    .delete(favoriteListingsTable)
    .where(
      and(
        eq(favoriteListingsTable.listingId, listingId),
        eq(favoriteListingsTable.buyerId, userId),
      ),
    );

  return result.rowCount || 0;
};

export const userFavoriteListings = async (
  userId: number,
  { limit, offset }: QueryParams,
) => {
  const listings = await db
    .select({
      listingId: listingTable.id,
      listingTitle: listingTable.title,
      listingDescription: listingTable.description,
      images: sql<Array<{ link: string; type: string }>>`
      json_agg(
        json_build_object(
          'link', ${carMediaTable.link},
          'type', ${carMediaTable.type}
        )
      )
    `.as("images"),
    })
    .from(listingTable)
    .innerJoin(carTable, eq(carTable.listingId, listingTable.id))
    .innerJoin(carMediaTable, eq(carMediaTable.carId, carTable.id))
    .innerJoin(usersTable, eq(usersTable.id, listingTable.userId))
    .innerJoin(
      favoriteListingsTable,
      eq(favoriteListingsTable.listingId, listingTable.id),
    )
    .where(eq(favoriteListingsTable.buyerId, userId))
    .groupBy(listingTable.id, listingTable.title, listingTable.description)
    .limit(limit)
    .offset((offset - 1) * limit);

  for (const listing of listings) {
    for (let image of listing.images) {
      const presignedUrl = await generateGetPresignedUrl(
        carBucketName,
        image.link,
      );
      image.link = presignedUrl;
    }
  }

  return listings;
};

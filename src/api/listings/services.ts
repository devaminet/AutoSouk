import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { listingTable } from "../../db/schema/listing";
import {
  generateGetPresignedUrl,
  generateGetPresignedUrls,
  generatePresignedUrl,
} from "../../utils/functions";
import { createCarSchema, getListingsQuerySchema } from "./request_schema";
import { BadRequestError } from "../../errors/bad_request_error";
import { NotFoundError } from "../../errors/not_found_error";
import { carBucketName } from "../../utils/constants";
import {
  approveListingById,
  checkCarExistanceByListingId,
  deleteListingDetails,
  findListingById,
  findListingCarId,
  findListings,
  getListingDetailsById,
  insertListing,
  saveCarAndMedia,
} from "./db";
import { InternalServerError } from "../../errors/internal_server_error";

export const saveListing = async (
  title: string,
  description: string,
  userId: number,
) => {
  return await insertListing(title, description, userId);
};

export const getUserListing = async (
  listingId: number,
  userId: number,
): Promise<Pick<typeof listingTable.$inferSelect, "id" | "userId"> | null> => {
  const listing = await db
    .select({ id: listingTable.id, userId: listingTable.userId })
    .from(listingTable)
    .where(
      and(eq(listingTable.id, listingId), eq(listingTable.userId, userId)),
    );

  return listing.length > 0 ? listing[0] : null;
};

export const attachCarToListing = async (
  data: z.infer<typeof createCarSchema>,
  listingId: number,
  userId: number,
) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("Listing was not found");
  }

  const found = await checkCarExistanceByListingId(listingId);

  if (found) {
    throw new BadRequestError("A car is already attached to this listing");
  }

  const { files, ...carDetails } = data;
  const filenamesPromises = files.map((file) => {
    return new Promise<{
      signedUrl: string;
      isPrimary: boolean;
      filename: string;
    }>((resolve, reject) => {
      generatePresignedUrl(carBucketName, file.name)
        .then((value) =>
          resolve({
            signedUrl: value,
            isPrimary: file.isPrimary,
            filename: file.name,
          }),
        )
        .catch(() =>
          reject(
            new InternalServerError(
              `Could not generate url for this image: ${file.name}`,
            ),
          ),
        );
    });
  });

  let carMedia: Awaited<(typeof filenamesPromises)[number]>[] = [];
  try {
    carMedia = await Promise.all(filenamesPromises);
  } catch (error) {
    throw new InternalServerError("Could not generate urls for images");
  }

  const car = await saveCarAndMedia({
    carDetails,
    carMedia,
    listingId,
    userId,
  });

  return {
    car,
    carMedia,
  };
};

export const getListingDetails = async (listingId: number) => {
  const listing = await getListingDetailsById(listingId);

  if (!listing) {
    throw new NotFoundError("Listing was not found!");
  }

  const carMedias = listing.car?.carMedias;
  if (carMedias) {
    const filenames = carMedias.map((media) => media.link);
    const urlsMap = await generateGetPresignedUrls(carBucketName, filenames);
    for (const media of carMedias) {
      media.link = urlsMap.get(media.link) || "";
    }
  }

  return listing;
};

export const approveListing = async (listingId: number) => {
  const listing = await findListingById(listingId);

  if (!listing) {
    throw new NotFoundError("Listing not found");
  }

  if (listing.status === "approved") {
    throw new BadRequestError("Listing is already approved");
  }

  const result = await approveListingById(listingId);
  return result;
};

export const getListings = async (
  query: z.infer<typeof getListingsQuerySchema>,
) => {
  const { limit, page } = query;
  const { listings, totalCountResult } = await findListings(query);

  for (const listing of listings) {
    if (listing.user && listing.user.imageUrl) {
      const imageUrl = await generateGetPresignedUrl(
        carBucketName,
        listing.user.imageUrl,
      );
      listing.user.imageUrl = imageUrl;
    }
    const carMedias = listing.car?.carMedias;
    if (carMedias) {
      const filenames = carMedias.map((media) => media.link);
      const urlsMap = await generateGetPresignedUrls(carBucketName, filenames);
      for (const media of carMedias) {
        media.link = urlsMap.get(media.link) || "";
      }
    }
  }

  const totalCount =
    totalCountResult.length > 0 ? totalCountResult[0]?.count : 0;

  return {
    listings,
    meta: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};

export const deleteListing = async (listingId: number, userId: number) => {
  const listing = await findListingCarId(userId, listingId);

  if (!listing) {
    throw new NotFoundError("Listing not found");
  }

  const carId = listing.car?.id;

  await deleteListingDetails(listingId, carId);

  return { deleted: true, listingId };
};

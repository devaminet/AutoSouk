import { z } from "zod";
import { and, eq, desc, asc, gte, lte, ilike, count } from "drizzle-orm";
import { db } from "../../db";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import {
  generateGetPresignedUrl,
  generateGetPresignedUrls,
  getFileType,
} from "../../utils/functions";
import { carMediaTable } from "../../db/schema/car_media";
import { createCarSchema, getListingsQuerySchema } from "./request-schema";
import { BadRequestError } from "../../errors/bad-request-error";
import { NotFoundError } from "../../errors/not-found-error";
import { carBucketName } from "../../utils/constants";

export const saveListing = async (
  title: string,
  description: string,
  userId: number,
) => {
  const result = await db
    .insert(listingTable)
    .values({
      title,
      description,
      status: "draft",
      userId,
    })
    .returning();

  return result[0];
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

export const saveCarAndMedia = async (args: {
  carDetails: Omit<z.infer<typeof createCarSchema>, "files">;
  carMedia: { signedUrl: string; isPrimary: boolean; filename: string }[];
  listingId: number;
  userId: number;
}) => {
  const { carDetails, carMedia, listingId, userId } = args;

  const existingCar = await db
    .select({ id: carTable.id })
    .from(carTable)
    .where(eq(carTable.listingId, listingId));

  if (existingCar.length > 0) {
    throw new BadRequestError("A car is already attached to this listing");
  }

  const car = await db.transaction(async (tx) => {
    const newCar = await tx
      .insert(carTable)
      .values({
        ...carDetails,
        listingId,
        userId,
      })
      .returning();

    const carMediaValues = carMedia.map((media) => ({
      carId: newCar[0].id,
      link: media.filename,
      type: getFileType(media.filename) as "image" | "video",
      isPrimary: media.isPrimary,
    }));

    await tx.insert(carMediaTable).values(carMediaValues);
    return { ...newCar[0] };
  });

  return car;
};

export const getListingDetails = async (listingId: number) => {
  const listing = await db.query.listingTable.findFirst({
    where: eq(listingTable.id, listingId),
    columns: {
      createdAt: false,
      updatedAt: false,
      userId: false,
    },
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          city: true,
          imageUrl: true,
          isVerified: true,
        },
      },
      car: {
        columns: {
          id: true,
          price: true,
          city: true,
          year: true,
          distance: true,
          doorsNumber: true,
          fiscalPower: true,
          transmission: true,
          ownersCount: true,
        },
        with: {
          carburant: {
            columns: {
              carburant: true,
            },
          },
          carMedias: {
            columns: {
              link: true,
              type: true,
              isPrimary: true,
            },
          },
          make: {
            columns: {
              name: true,
            },
          },
          model: {
            columns: {
              name: true,
            },
          },
          origin: {
            columns: {
              origin: true,
            },
          },
          state: {
            columns: {
              state: true,
            },
          },
        },
      },
    },
  });

  return listing;
};

export const approveListing = async (listingId: number) => {
  const listing = await db
    .select()
    .from(listingTable)
    .where(eq(listingTable.id, listingId));

  if (listing.length === 0) {
    throw new NotFoundError("Listing not found");
  }

  if (listing[0].status === "approved") {
    throw new BadRequestError("Listing is already approved");
  }

  const result = await db
    .update(listingTable)
    .set({ status: "approved", approvedAt: new Date().toISOString() })
    .where(eq(listingTable.id, listingId));
  return result.rowCount;
};

export const getListings = async (
  query: z.infer<typeof getListingsQuerySchema>,
) => {
  const { page, limit, makeId, modelId, city, minPrice, maxPrice, sort } =
    query;

  const conditions = [eq(listingTable.status, "approved")];

  if (makeId) conditions.push(eq(carTable.makeId, makeId));
  if (modelId) conditions.push(eq(carTable.modelId, modelId));
  if (city) conditions.push(ilike(carTable.city, `%${city}%`));
  if (minPrice !== undefined) conditions.push(gte(carTable.price, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(carTable.price, maxPrice));

  let orderByClause;
  if (sort === "price_asc") {
    orderByClause = asc(carTable.price);
  } else if (sort === "price_desc") {
    orderByClause = desc(carTable.price);
  } else if (sort === "oldest") {
    orderByClause = asc(listingTable.createdAt);
  } else {
    orderByClause = desc(listingTable.createdAt);
  }

  const listings = await db.query.listingTable.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
    },
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          imageUrl: true,
          phone: true,
        },
      },
      car: {
        columns: {},
        with: {
          carMedias: {
            columns: {
              type: true,
              link: true,
              isPrimary: true,
            },
            orderBy(fields, operators) {
              return operators.desc(fields.isPrimary);
            },
          },
        },
      },
    },
    where: and(...conditions),
    orderBy: orderByClause,
    limit,
    offset: (page - 1) * limit,
  });

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

  const totalCountResult = await db
    .select({ count: count() })
    .from(listingTable)
    .innerJoin(carTable, eq(listingTable.id, carTable.listingId))
    .where(and(...conditions));

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
  const listing = await db
    .select({
      id: listingTable.id,
      userId: listingTable.userId,
      car: {
        id: carTable.id,
      },
    })
    .from(listingTable)
    .where(and(eq(listingTable.id, listingId), eq(listingTable.userId, userId)))
    .innerJoin(carTable, eq(listingTable.id, carTable.listingId));

  if (listing.length === 0) {
    throw new NotFoundError("Listing not found");
  }

  const carId = listing[0].car?.id;

  await db.transaction(async (tx) => {
    if (carId) {
      await tx.delete(carMediaTable).where(eq(carMediaTable.carId, carId));
      await tx.delete(carTable).where(eq(carTable.id, carId));
    }

    await tx.delete(listingTable).where(eq(listingTable.id, listingId));
  });

  return { deleted: true, listingId };
};

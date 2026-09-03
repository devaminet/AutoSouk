import { z } from "zod";
import { createCarSchema, getListingsQuerySchema } from "./request_schema";
import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import { db } from "../../db";
import { carMediaTable } from "../../db/schema/car_media";
import { getFileType } from "../../utils/functions";

export const findListings = async (
  options: z.infer<typeof getListingsQuerySchema>,
) => {
  const { page, limit, makeId, modelId, cityId, minPrice, maxPrice, sort } =
    options;

  const conditions = [eq(listingTable.status, "approved")];

  if (makeId) conditions.push(eq(carTable.makeId, makeId));
  if (modelId) conditions.push(eq(carTable.modelId, modelId));
  if (cityId) conditions.push(eq(carTable.cityId, cityId));
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
          city: {
            columns: {
              name: true,
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

  const totalCountResult = await db
    .select({ count: count() })
    .from(listingTable)
    .innerJoin(carTable, eq(listingTable.id, carTable.listingId))
    .where(and(...conditions));

  return { listings, totalCountResult };
};

export const insertListing = async (
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

export const getListingDetailsById = async (id: number) => {
  return await db.query.listingTable.findFirst({
    where: eq(listingTable.id, id),
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
          cityId: true,
          imageUrl: true,
          isVerified: true,
        },
        with: {
          city: {
            columns: {
              name: true,
            },
          },
        },
      },
      car: {
        columns: {
          id: true,
          price: true,
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
          city: {
            columns: {
              name: true,
            },
          },
        },
      },
    },
  });
};

export const findListingById = async (id: number) => {
  const listing = await db
    .select()
    .from(listingTable)
    .where(eq(listingTable.id, id));

  if (listing.length === 0) {
    return null;
  }

  return listing[0];
};

export const approveListingById = async (id: number) => {
  return await db
    .update(listingTable)
    .set({ status: "approved", approvedAt: new Date().toISOString() })
    .where(eq(listingTable.id, id))
    .returning();
};

export const findListingCarId = async (userId: number, listingId: number) => {
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
    return null;
  }

  return listing[0];
};

export const deleteListingDetails = async (
  listingId: number,
  carId: number,
) => {
  await db.transaction(async (tx) => {
    if (carId) {
      await tx.delete(carMediaTable).where(eq(carMediaTable.carId, carId));
      await tx.delete(carTable).where(eq(carTable.id, carId));
    }

    await tx.delete(listingTable).where(eq(listingTable.id, listingId));
  });
};

export const checkCarExistanceByListingId = async (listingId: number) => {
  const existingCar = await db
    .select({ id: carTable.id })
    .from(carTable)
    .where(eq(carTable.listingId, listingId));

  if (existingCar.length === 0) {
    return false;
  }

  return true;
};

export const saveCarAndMedia = async (args: {
  carDetails: Omit<z.infer<typeof createCarSchema>, "files">;
  carMedia: { signedUrl: string; isPrimary: boolean; filename: string }[];
  listingId: number;
  userId: number;
}) => {
  const { carDetails, carMedia, listingId, userId } = args;

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

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import { getFileType } from "../../utils/functions";
import { carMediaTable } from "../../db/schema/car_media";
import { createCarSchema } from "../cars/request-schema";
import { BadRequestError } from "../../errors/bad-request-error";
import { NotFoundError } from "../../errors/not-found-error";

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
  carDetails: Omit<z.infer<typeof createCarSchema>, "filenames">;
  filenames: string[];
  urlsMap: Map<string, string>;
  listingId: number;
  userId: number;
}) => {
  console.log("args", args);
  const { carDetails, filenames, urlsMap, listingId, userId } = args;
  const car = await db.transaction(async (tx) => {
    const newCar = await tx
      .insert(carTable)
      .values({
        ...carDetails,
        listingId,
        userId,
      })
      .returning();

    const carMediaValues = filenames.map((filename) => ({
      carId: newCar[0].id,
      link: filename,
      type: getFileType(filename) as "image" | "video",
    }));

    await tx.insert(carMediaTable).values(carMediaValues);
    return { ...newCar[0], filenames, urls: Object.fromEntries(urlsMap) };
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

import { z } from "zod";
import {
  createCarSchema,
  getListingsQuerySchema,
  updateListingSchema,
} from "./request_schema";
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
} from "drizzle-orm";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import { db } from "../../db";
import { carMediaTable } from "../../db/schema/car_media";
import { makeTable } from "../../db/schema/car_make";
import { carModelTable } from "../../db/schema/car_model";
import { carCarburantTable } from "../../db/schema/carburant";
import { carOriginTable } from "../../db/schema/car_origin";
import { carStateTable } from "../../db/schema/state";
import { cityTable } from "../../db/schema/city";
import { getFileType } from "../../utils/functions";
import { carEquipmentTable, equipmentTable } from "../../db/schema/equipment";

// Listing ids whose car has every one of the given (distinct) equipment ids.
const listingIdsWithAllEquipment = (equipmentIds: number[]) =>
  db
    .select({ listingId: carTable.listingId })
    .from(carEquipmentTable)
    .innerJoin(carTable, eq(carTable.id, carEquipmentTable.carId))
    .where(inArray(carEquipmentTable.equipmentId, equipmentIds))
    .groupBy(carTable.listingId)
    .having(eq(count(), equipmentIds.length));

// The id breaks ties so pages stay stable when the sort key is equal.
const listingsOrderBy = {
  price_asc: [asc(carTable.price), asc(listingTable.id)],
  price_desc: [desc(carTable.price), desc(listingTable.id)],
  oldest: [asc(listingTable.createdAt), asc(listingTable.id)],
  newest: [desc(listingTable.createdAt), desc(listingTable.id)],
} satisfies Record<z.infer<typeof getListingsQuerySchema>["sort"], SQL[]>;

export const findListings = async (
  options: z.infer<typeof getListingsQuerySchema>,
) => {
  const {
    page,
    limit,
    makeId,
    modelId,
    cityId,
    minPrice,
    maxPrice,
    equipmentIds,
    sort,
  } = options;

  const conditions = [eq(listingTable.status, "approved")];

  if (makeId) conditions.push(eq(carTable.makeId, makeId));
  if (modelId) conditions.push(eq(carTable.modelId, modelId));
  if (cityId) conditions.push(eq(carTable.cityId, cityId));
  if (minPrice !== undefined) conditions.push(gte(carTable.price, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(carTable.price, maxPrice));
  if (equipmentIds && equipmentIds.length > 0) {
    conditions.push(
      inArray(listingTable.id, listingIdsWithAllEquipment(equipmentIds)),
    );
  }

  const orderBy = listingsOrderBy[sort];

  // Filters and sorting use car columns, so the page of ids comes from a
  // plain join: a relational findMany would rewrite those columns onto the
  // listings alias and fail.
  const pageRows = await db
    .select({ id: listingTable.id })
    .from(listingTable)
    .innerJoin(carTable, eq(listingTable.id, carTable.listingId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset((page - 1) * limit);
  const pageIds = pageRows.map(({ id }) => id);

  const totalCountResult = await db
    .select({ count: count() })
    .from(listingTable)
    .innerJoin(carTable, eq(listingTable.id, carTable.listingId))
    .where(and(...conditions));

  if (pageIds.length === 0) {
    return { listings: [], totalCountResult };
  }

  const found = await db.query.listingTable.findMany({
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
          imageName: true,
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
            where: eq(carMediaTable.isUploaded, true),
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
    where: inArray(listingTable.id, pageIds),
  });

  const position = new Map(pageIds.map((id, index) => [id, index]));
  const listings = found.sort(
    (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
  );

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
          imageName: true,
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
              id: true,
              link: true,
              type: true,
              isPrimary: true,
            },
            where: eq(carMediaTable.isUploaded, true),
            orderBy: [desc(carMediaTable.isPrimary), asc(carMediaTable.id)],
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
          equipment: {
            columns: {},
            with: {
              equipment: {
                columns: { id: true, slug: true, name: true, position: true },
                with: {
                  category: {
                    columns: { slug: true, name: true, position: true },
                  },
                },
              },
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

export const findListingCityById = async (id: number) => {
  const listing = await db.query.listingTable.findFirst({
    where: eq(listingTable.id, id),
    columns: {
      status: true,
    },
    with: {
      car: {
        columns: {
          cityId: true,
        },
      },
    },
  });

  return listing ?? null;
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

// Returns null when the listing already has a car (unique listing_id).
// Attaching a car sends the listing to admin approval.
export const saveCarAndMedia = async (args: {
  carDetails: Omit<z.infer<typeof createCarSchema>, "files" | "equipmentIds">;
  carMedia: { isPrimary: boolean; filename: string }[];
  equipmentIds: number[];
  listingId: number;
  userId: number;
}) => {
  const { carDetails, carMedia, equipmentIds, listingId, userId } = args;

  return await db.transaction(async (tx) => {
    const [newCar] = await tx
      .insert(carTable)
      .values({
        ...carDetails,
        listingId,
        userId,
      })
      .onConflictDoNothing({ target: carTable.listingId })
      .returning();

    if (!newCar) {
      return null;
    }

    const carMediaValues = carMedia.map((media) => ({
      carId: newCar.id,
      link: media.filename,
      type: getFileType(media.filename) as "image" | "video",
      isPrimary: media.isPrimary,
      isUploaded: false,
    }));

    await tx.insert(carMediaTable).values(carMediaValues);
    if (equipmentIds.length > 0) {
      await tx.insert(carEquipmentTable).values(
        equipmentIds.map((equipmentId) => ({
          carId: newCar.id,
          equipmentId,
        })),
      );
    }
    await tx
      .update(listingTable)
      .set({
        status: "pending",
        approvedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(listingTable.id, listingId));

    return newCar;
  });
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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Locks the listing's car so concurrent changes to its equipment or media
// run one after the other.
const lockListingCar = async (tx: Transaction, listingId: number) => {
  const [car] = await tx
    .select({ id: carTable.id })
    .from(carTable)
    .where(eq(carTable.listingId, listingId))
    .for("update");
  return car ?? null;
};

// Replaces the whole equipment set of the listing's car. The car row is
// locked first so concurrent replacements run one after the other instead
// of colliding on the car_equipment primary key.
const replaceCarEquipment = async (
  tx: Transaction,
  listingId: number,
  equipmentIds: number[],
) => {
  const car = await lockListingCar(tx, listingId);
  if (!car) {
    return;
  }

  await tx.delete(carEquipmentTable).where(eq(carEquipmentTable.carId, car.id));
  if (equipmentIds.length > 0) {
    await tx
      .insert(carEquipmentTable)
      .values(
        equipmentIds.map((equipmentId) => ({ carId: car.id, equipmentId })),
      );
  }
};

export const updateListingAndMarkPending = async (
  listingId: number,
  changes: z.infer<typeof updateListingSchema>,
) => {
  const { car, ...listingChanges } = changes;
  const { equipmentIds, ...carChanges } = car ?? {};

  return await db.transaction(async (tx) => {
    if (Object.keys(carChanges).length > 0) {
      await tx
        .update(carTable)
        .set(carChanges)
        .where(eq(carTable.listingId, listingId));
    }
    if (equipmentIds !== undefined) {
      await replaceCarEquipment(tx, listingId, equipmentIds);
    }

    const updated = await tx
      .update(listingTable)
      .set({
        ...listingChanges,
        status: "pending",
        approvedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(listingTable.id, listingId))
      .returning();

    return updated[0];
  });
};

export type CarReferenceIds = {
  makeId?: number;
  modelId?: number;
  carburantId?: number;
  originId?: number;
  stateId?: number;
  cityId?: number;
};

export type CarReferenceField = keyof CarReferenceIds;

const idExists = async (query: Promise<{ id: number }[]>) => {
  const rows = await query;
  return rows.length > 0;
};

// Returns the reference fields whose id does not exist. A model is also
// invalid when it does not belong to the given make.
export const findInvalidCarReferences = async (
  ids: CarReferenceIds,
): Promise<CarReferenceField[]> => {
  const checks: [CarReferenceField, Promise<boolean>][] = [];
  const check = (field: CarReferenceField, query: Promise<{ id: number }[]>) =>
    checks.push([field, idExists(query)]);

  const { makeId, modelId, carburantId, originId, stateId, cityId } = ids;

  if (makeId !== undefined) {
    check(
      "makeId",
      db
        .select({ id: makeTable.id })
        .from(makeTable)
        .where(eq(makeTable.id, makeId)),
    );
  }
  if (modelId !== undefined) {
    const conditions = [eq(carModelTable.id, modelId)];
    if (makeId !== undefined) {
      conditions.push(eq(carModelTable.makeId, makeId));
    }
    check(
      "modelId",
      db
        .select({ id: carModelTable.id })
        .from(carModelTable)
        .where(and(...conditions)),
    );
  }
  if (carburantId !== undefined) {
    check(
      "carburantId",
      db
        .select({ id: carCarburantTable.id })
        .from(carCarburantTable)
        .where(eq(carCarburantTable.id, carburantId)),
    );
  }
  if (originId !== undefined) {
    check(
      "originId",
      db
        .select({ id: carOriginTable.id })
        .from(carOriginTable)
        .where(eq(carOriginTable.id, originId)),
    );
  }
  if (stateId !== undefined) {
    check(
      "stateId",
      db
        .select({ id: carStateTable.id })
        .from(carStateTable)
        .where(eq(carStateTable.id, stateId)),
    );
  }
  if (cityId !== undefined) {
    check(
      "cityId",
      db
        .select({ id: cityTable.id })
        .from(cityTable)
        .where(eq(cityTable.id, cityId)),
    );
  }

  const results = await Promise.all(checks.map(([, exists]) => exists));
  return checks.filter((_, index) => !results[index]).map(([field]) => field);
};

// Returns the given equipment ids that are not in the catalog.
export const findMissingEquipmentIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: equipmentTable.id })
    .from(equipmentTable)
    .where(inArray(equipmentTable.id, ids));
  const found = new Set(rows.map(({ id }) => id));

  return ids.filter((id) => !found.has(id));
};

export const findCarReferencesByListingId = async (listingId: number) => {
  const car = await db.query.carTable.findFirst({
    where: eq(carTable.listingId, listingId),
    columns: { makeId: true, modelId: true },
  });

  return car ?? null;
};

export const findCarMediaByListing = async (
  listingId: number,
  userId: number,
) => {
  return await db
    .select({
      id: carMediaTable.id,
      link: carMediaTable.link,
      type: carMediaTable.type,
      isPrimary: carMediaTable.isPrimary,
      isUploaded: carMediaTable.isUploaded,
    })
    .from(carMediaTable)
    .innerJoin(carTable, eq(carTable.id, carMediaTable.carId))
    .innerJoin(listingTable, eq(listingTable.id, carTable.listingId))
    .where(
      and(eq(listingTable.id, listingId), eq(listingTable.userId, userId)),
    );
};

// Newly visible media has not been reviewed, so the listing goes back to
// admin approval, like any other listing edit.
export const markCarMediaUploaded = async (
  listingId: number,
  mediaIds: number[],
) => {
  if (mediaIds.length === 0) {
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(carMediaTable)
      .set({ isUploaded: true })
      .where(inArray(carMediaTable.id, mediaIds));
    await tx
      .update(listingTable)
      .set({
        status: "pending",
        approvedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(listingTable.id, listingId));
  });
};

export type AddCarMediaResult =
  | { status: "no_car" }
  | { status: "over_limit" }
  | { status: "added"; media: { id: number; link: string }[] };

// Adds not yet uploaded media to the listing's car unless the car would end
// up with more than maxCount files. Pending uploads count towards the limit.
export const insertCarMediaWithinLimit = async (
  listingId: number,
  filenames: string[],
  maxCount: number,
): Promise<AddCarMediaResult> => {
  return await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if (!car) {
      return { status: "no_car" };
    }

    const [{ total }] = await tx
      .select({ total: count() })
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, car.id));
    if (total + filenames.length > maxCount) {
      return { status: "over_limit" };
    }

    const media = await tx
      .insert(carMediaTable)
      .values(
        filenames.map((filename) => ({
          carId: car.id,
          link: filename,
          type: getFileType(filename) as "image" | "video",
          isPrimary: false,
          isUploaded: false,
        })),
      )
      .returning({ id: carMediaTable.id, link: carMediaTable.link });

    return { status: "added", media };
  });
};

// Gives the car a primary image again after its primary was deleted:
// the oldest uploaded image, or the oldest image still waiting for upload.
const ensureCarPrimaryImage = async (tx: Transaction, carId: number) => {
  const [primary] = await tx
    .select({ id: carMediaTable.id })
    .from(carMediaTable)
    .where(
      and(eq(carMediaTable.carId, carId), eq(carMediaTable.isPrimary, true)),
    );
  if (primary) {
    return;
  }

  const [next] = await tx
    .select({ id: carMediaTable.id })
    .from(carMediaTable)
    .where(and(eq(carMediaTable.carId, carId), eq(carMediaTable.type, "image")))
    .orderBy(desc(carMediaTable.isUploaded), asc(carMediaTable.id))
    .limit(1);
  if (next) {
    await tx
      .update(carMediaTable)
      .set({ isPrimary: true })
      .where(eq(carMediaTable.id, next.id));
  }
};

// Removes media that failed upload validation, keeping a primary image.
export const deleteCarMediaByIds = async (
  listingId: number,
  mediaIds: number[],
) => {
  if (mediaIds.length === 0) {
    return;
  }
  await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if (!car) {
      return;
    }
    await tx
      .delete(carMediaTable)
      .where(
        and(
          eq(carMediaTable.carId, car.id),
          inArray(carMediaTable.id, mediaIds),
        ),
      );
    await ensureCarPrimaryImage(tx, car.id);
  });
};

export type DeleteCarMediaResult =
  | { status: "no_car" }
  | { status: "unknown_media"; mediaIds: number[] }
  | { status: "below_minimum" }
  | {
      status: "deleted";
      deleted: { id: number; link: string }[];
      remaining: {
        id: number;
        link: string;
        type: "image" | "video";
        isPrimary: boolean;
      }[];
    };

// Deletes media from the listing's car unless fewer than minImages uploaded
// images would remain. Media that is not uploaded yet can always be deleted.
export const deleteCarMediaKeepingMinimum = async (
  listingId: number,
  mediaIds: number[],
  minImages: number,
): Promise<DeleteCarMediaResult> => {
  return await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if (!car) {
      return { status: "no_car" };
    }

    const media = await tx
      .select({
        id: carMediaTable.id,
        link: carMediaTable.link,
        type: carMediaTable.type,
        isPrimary: carMediaTable.isPrimary,
        isUploaded: carMediaTable.isUploaded,
      })
      .from(carMediaTable)
      .where(eq(carMediaTable.carId, car.id))
      .orderBy(desc(carMediaTable.isPrimary), asc(carMediaTable.id));

    const carMediaIds = new Set(media.map(({ id }) => id));
    const unknownIds = mediaIds.filter((id) => !carMediaIds.has(id));
    if (unknownIds.length > 0) {
      return { status: "unknown_media", mediaIds: unknownIds };
    }

    const toDelete = new Set(mediaIds);
    const remainingImages = media.filter(
      (item) =>
        !toDelete.has(item.id) && item.isUploaded && item.type === "image",
    );
    if (remainingImages.length < minImages) {
      return { status: "below_minimum" };
    }

    await tx.delete(carMediaTable).where(inArray(carMediaTable.id, mediaIds));
    await ensureCarPrimaryImage(tx, car.id);

    const remaining = await tx
      .select({
        id: carMediaTable.id,
        link: carMediaTable.link,
        type: carMediaTable.type,
        isPrimary: carMediaTable.isPrimary,
      })
      .from(carMediaTable)
      .where(
        and(
          eq(carMediaTable.carId, car.id),
          eq(carMediaTable.isUploaded, true),
        ),
      )
      .orderBy(desc(carMediaTable.isPrimary), asc(carMediaTable.id));

    return {
      status: "deleted",
      deleted: media
        .filter((item) => toDelete.has(item.id))
        .map(({ id, link }) => ({ id, link })),
      remaining,
    };
  });
};

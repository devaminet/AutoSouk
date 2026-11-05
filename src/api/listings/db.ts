import { z } from "zod";
import {
  createCarSchema,
  getListingsQuerySchema,
  getMyListingsQuerySchema,
  getPendingListingsQuerySchema,
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
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { listingStatusEnum, listingTable } from "../../db/schema/listing";
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
import { inspectionTable } from "../../db/schema/inspection";

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
              slug: true,
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

const listingCarSummary = {
  columns: { id: true, price: true, year: true, distance: true },
  with: {
    make: { columns: { name: true } },
    model: { columns: { name: true } },
    city: { columns: { name: true, slug: true } },
    carMedias: {
      columns: { id: true, type: true, link: true, isPrimary: true },
      where: eq(carMediaTable.isUploaded, true),
      orderBy: [desc(carMediaTable.isPrimary), asc(carMediaTable.id)] as SQL[],
    },
  },
} as const;

// The moderation queue: the listing waiting the longest comes first.
export const findPendingListings = async ({
  page,
  limit,
}: z.infer<typeof getPendingListingsQuerySchema>) => {
  const where = eq(listingTable.status, "pending");

  const listings = await db.query.listingTable.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      user: {
        columns: { firstName: true, lastName: true, imageName: true },
      },
      car: { ...listingCarSummary },
    },
    where,
    orderBy: [asc(listingTable.updatedAt), asc(listingTable.id)],
    limit,
    offset: (page - 1) * limit,
  });

  const [{ total }] = await db
    .select({ total: count() })
    .from(listingTable)
    .where(where);

  return { listings, total };
};

// A seller's listings in every status. Drafts have no car yet, and filters and
// sorting only use listing columns, so this stays a relational query.
export const findListingsBySeller = async (
  userId: number,
  options: z.infer<typeof getMyListingsQuerySchema>,
) => {
  const { page, limit, status } = options;
  const where = and(
    eq(listingTable.userId, userId),
    status ? eq(listingTable.status, status) : undefined,
  );

  const listings = await db.query.listingTable.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      status: true,
      approvedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    },
    with: { car: { ...listingCarSummary } },
    where,
    orderBy: [desc(listingTable.createdAt), desc(listingTable.id)],
    limit,
    offset: (page - 1) * limit,
  });

  const [{ total }] = await db
    .select({ total: count() })
    .from(listingTable)
    .where(where);

  return { listings, total };
};

// One row per status the seller has listings in, whatever filter the page uses.
export const countSellerListingsByStatus = async (userId: number) => {
  return await db
    .select({ status: listingTable.status, total: count() })
    .from(listingTable)
    .where(eq(listingTable.userId, userId))
    .groupBy(listingTable.status);
};

// One query for the whole page. Cars without a completed inspection have no row.
export const countCompletedInspectionsByCar = async (carIds: number[]) => {
  if (carIds.length === 0) {
    return [];
  }

  return await db
    .select({ carId: inspectionTable.carId, total: count() })
    .from(inspectionTable)
    .where(
      and(
        inArray(inspectionTable.carId, carIds),
        eq(inspectionTable.status, "completed"),
      ),
    )
    .groupBy(inspectionTable.carId);
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
              slug: true,
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
              slug: true,
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

// Only a pending listing can be rejected; the condition is part of the update
// so that a listing approved or edited at the same time is left alone.
export const rejectPendingListingById = async (id: number, reason: string) => {
  const [listing] = await db
    .update(listingTable)
    .set({
      status: "rejected",
      rejectionReason: reason,
      approvedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(listingTable.id, id), eq(listingTable.status, "pending")))
    .returning();

  return listing ?? null;
};

// The seller's listing with the id of its car. A left join, because a listing
// can have no car: car is null then.
export const findListingCarId = async (userId: number, listingId: number) => {
  const [listing] = await db
    .select({
      id: listingTable.id,
      userId: listingTable.userId,
      car: {
        id: carTable.id,
      },
    })
    .from(listingTable)
    .leftJoin(carTable, eq(listingTable.id, carTable.listingId))
    .where(
      and(eq(listingTable.id, listingId), eq(listingTable.userId, userId)),
    );

  return listing ?? null;
};

export const deleteListingDetails = async (
  listingId: number,
  carId: number | undefined,
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
// The listing keeps its status: a draft goes to review through submit.
export const saveCar = async (args: {
  carDetails: Omit<z.infer<typeof createCarSchema>, "equipmentIds">;
  equipmentIds: number[];
  listingId: number;
  userId: number;
}) => {
  const { carDetails, equipmentIds, listingId, userId } = args;

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
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(listingTable.id, listingId));

    return newCar;
  });
};

export const getUserListing = async (
  listingId: number,
  userId: number,
): Promise<Pick<
  typeof listingTable.$inferSelect,
  "id" | "userId" | "status"
> | null> => {
  const listing = await db
    .select({
      id: listingTable.id,
      userId: listingTable.userId,
      status: listingTable.status,
    })
    .from(listingTable)
    .where(
      and(eq(listingTable.id, listingId), eq(listingTable.userId, userId)),
    );

  return listing.length > 0 ? listing[0] : null;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ListingStatus = (typeof listingStatusEnum.enumValues)[number];

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

// A seller's edit leaves a draft as a draft. Any other status needs a new
// review. The status is decided in the update itself, so an edit racing with
// submit or approve cannot act on a status it read earlier.
const sellerEditChanges = () => ({
  status: sql<ListingStatus>`CASE WHEN ${listingTable.status} = 'draft' THEN 'draft'::listing_status ELSE 'pending'::listing_status END`,
  approvedAt: null,
  rejectionReason: null,
  updatedAt: new Date().toISOString(),
});

export const updateListingAfterSellerEdit = async (
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
      .set({ ...listingChanges, ...sellerEditChanges() })
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

const readListingStatus = async (tx: Transaction, listingId: number) => {
  const [listing] = await tx
    .select({ status: listingTable.status })
    .from(listingTable)
    .where(eq(listingTable.id, listingId));
  return listing?.status ?? null;
};

const uploadedImageOfCar = (carId: number) =>
  and(
    eq(carMediaTable.carId, carId),
    eq(carMediaTable.type, "image"),
    eq(carMediaTable.isUploaded, true),
  );

// Makes the oldest uploaded image primary when the car has no uploaded primary
// image. A primary flag on a file that is not uploaded does not count, and is
// moved. Without any uploaded image the car stays without a primary.
const ensureCarPrimaryImage = async (tx: Transaction, carId: number) => {
  const [primary] = await tx
    .select({ id: carMediaTable.id })
    .from(carMediaTable)
    .where(and(uploadedImageOfCar(carId), eq(carMediaTable.isPrimary, true)));
  if (primary) {
    return;
  }

  const [next] = await tx
    .select({ id: carMediaTable.id })
    .from(carMediaTable)
    .where(uploadedImageOfCar(carId))
    .orderBy(asc(carMediaTable.id))
    .limit(1);
  if (next) {
    await tx
      .update(carMediaTable)
      .set({ isPrimary: sql`${carMediaTable.id} = ${next.id}` })
      .where(eq(carMediaTable.carId, carId));
  }
};

// Applies the outcome of a confirm in one transaction: invalid files go, found
// files become visible, and the car gets a primary image if it needs one. New
// visible media needs a review, unless the listing is still a draft.
export const applyCarMediaConfirmation = async (
  listingId: number,
  uploadedIds: number[],
  rejectedIds: number[],
) => {
  await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if (!car) {
      return;
    }

    if (rejectedIds.length > 0) {
      await tx
        .delete(carMediaTable)
        .where(
          and(
            eq(carMediaTable.carId, car.id),
            inArray(carMediaTable.id, rejectedIds),
          ),
        );
    }

    const uploaded =
      uploadedIds.length > 0
        ? await tx
            .update(carMediaTable)
            .set({ isUploaded: true })
            .where(
              and(
                eq(carMediaTable.carId, car.id),
                inArray(carMediaTable.id, uploadedIds),
              ),
            )
            .returning({ id: carMediaTable.id })
        : [];

    await ensureCarPrimaryImage(tx, car.id);

    if (uploaded.length > 0) {
      await tx
        .update(listingTable)
        .set(sellerEditChanges())
        .where(eq(listingTable.id, listingId));
    }
  });
};

type UploadedCarMedia = {
  id: number;
  link: string;
  type: "image" | "video";
  isPrimary: boolean;
};

// The car's visible media, primary first, then in upload order.
const findUploadedCarMedia = async (
  tx: Transaction,
  carId: number,
): Promise<UploadedCarMedia[]> => {
  return await tx
    .select({
      id: carMediaTable.id,
      link: carMediaTable.link,
      type: carMediaTable.type,
      isPrimary: carMediaTable.isPrimary,
    })
    .from(carMediaTable)
    .where(
      and(eq(carMediaTable.carId, carId), eq(carMediaTable.isUploaded, true)),
    )
    .orderBy(desc(carMediaTable.isPrimary), asc(carMediaTable.id));
};

export type DeleteCarMediaResult =
  | { status: "no_car" }
  | { status: "unknown_media"; mediaIds: number[] }
  | { status: "below_minimum" }
  | {
      status: "deleted";
      deleted: { id: number; link: string }[];
      remaining: UploadedCarMedia[];
    };

// Deletes media from the listing's car. Outside a draft, a delete that removes
// an uploaded image must leave at least minImages of them. Media that is not
// uploaded yet can always be deleted, so a stuck file never blocks the seller.
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
    const uploadedImages = media.filter(
      (item) => item.isUploaded && item.type === "image",
    );
    const remainingImages = uploadedImages.filter(
      (item) => !toDelete.has(item.id),
    );
    const removesUploadedImage = remainingImages.length < uploadedImages.length;
    // Read after taking the car lock, which submit and approve also take.
    const status = await readListingStatus(tx, listingId);
    if (
      status !== "draft" &&
      removesUploadedImage &&
      remainingImages.length < minImages
    ) {
      return { status: "below_minimum" };
    }

    await tx.delete(carMediaTable).where(inArray(carMediaTable.id, mediaIds));
    await ensureCarPrimaryImage(tx, car.id);

    const remaining = await findUploadedCarMedia(tx, car.id);

    return {
      status: "deleted",
      deleted: media
        .filter((item) => toDelete.has(item.id))
        .map(({ id, link }) => ({ id, link })),
      remaining,
    };
  });
};

export type SetPrimaryCarMediaResult =
  | { status: "no_car" }
  | { status: "not_found" }
  | { status: "not_image" }
  | { status: "not_uploaded" }
  | { status: "updated"; media: UploadedCarMedia[] };

// Makes an uploaded image of the listing's car its only primary media.
export const setPrimaryCarMedia = async (
  listingId: number,
  mediaId: number,
): Promise<SetPrimaryCarMediaResult> => {
  return await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if (!car) {
      return { status: "no_car" };
    }

    const [target] = await tx
      .select({
        type: carMediaTable.type,
        isUploaded: carMediaTable.isUploaded,
      })
      .from(carMediaTable)
      .where(
        and(eq(carMediaTable.id, mediaId), eq(carMediaTable.carId, car.id)),
      );
    if (!target) {
      return { status: "not_found" };
    }
    if (target.type !== "image") {
      return { status: "not_image" };
    }
    if (!target.isUploaded) {
      return { status: "not_uploaded" };
    }

    await tx
      .update(carMediaTable)
      .set({ isPrimary: sql`${carMediaTable.id} = ${mediaId}` })
      .where(eq(carMediaTable.carId, car.id));

    return { status: "updated", media: await findUploadedCarMedia(tx, car.id) };
  });
};

const countUploadedImages = async (tx: Transaction, carId: number) => {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(carMediaTable)
    .where(uploadedImageOfCar(carId));
  return total;
};

export type SubmitListingResult =
  | { status: "not_draft" }
  | { status: "no_car" }
  | { status: "too_few_images" }
  | { status: "no_primary" }
  | { status: "submitted"; listing: typeof listingTable.$inferSelect };

// Sends a complete draft to review. The car lock keeps a concurrent media
// delete from dropping below the checked minimum before the status changes.
export const submitDraftListing = async (
  listingId: number,
  minImages: number,
): Promise<SubmitListingResult> => {
  return await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if ((await readListingStatus(tx, listingId)) !== "draft") {
      return { status: "not_draft" };
    }
    if (!car) {
      return { status: "no_car" };
    }
    if ((await countUploadedImages(tx, car.id)) < minImages) {
      return { status: "too_few_images" };
    }

    const [primary] = await tx
      .select({ id: carMediaTable.id })
      .from(carMediaTable)
      .where(
        and(uploadedImageOfCar(car.id), eq(carMediaTable.isPrimary, true)),
      );
    if (!primary) {
      return { status: "no_primary" };
    }

    const [listing] = await tx
      .update(listingTable)
      .set({
        status: "pending",
        approvedAt: null,
        rejectionReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(listingTable.id, listingId), eq(listingTable.status, "draft")),
      )
      .returning();

    return listing ? { status: "submitted", listing } : { status: "not_draft" };
  });
};

export type ApproveListingResult =
  | { status: "not_pending" }
  | { status: "no_car" }
  | { status: "too_few_images" }
  | { status: "approved"; listings: (typeof listingTable.$inferSelect)[] };

// Only a complete pending listing can be approved. The status is checked again
// in the update, so a listing edited at the same time is left alone.
export const approvePendingListing = async (
  listingId: number,
  minImages: number,
): Promise<ApproveListingResult> => {
  return await db.transaction(async (tx) => {
    const car = await lockListingCar(tx, listingId);
    if ((await readListingStatus(tx, listingId)) !== "pending") {
      return { status: "not_pending" };
    }
    if (!car) {
      return { status: "no_car" };
    }
    if ((await countUploadedImages(tx, car.id)) < minImages) {
      return { status: "too_few_images" };
    }

    const listings = await tx
      .update(listingTable)
      .set({
        status: "approved",
        approvedAt: new Date().toISOString(),
        rejectionReason: null,
      })
      .where(
        and(eq(listingTable.id, listingId), eq(listingTable.status, "pending")),
      )
      .returning();

    return listings.length > 0
      ? { status: "approved", listings }
      : { status: "not_pending" };
  });
};

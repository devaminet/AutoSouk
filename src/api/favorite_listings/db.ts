import { and, count, desc, eq, inArray, not, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../../db";
import { favoriteListingsTable } from "../../db/schema/favorite_listing";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import { inspectionTable } from "../../db/schema/inspection";
import { QueryParams } from "./request_schema";
import { latestInspectionScores, listingCardCar } from "../listings/db";

// Whether buyers can see the listing, and so keep it.
export const isApprovedListing = async (listingId: number) => {
  const [listing] = await db
    .select({ id: listingTable.id })
    .from(listingTable)
    .where(
      and(eq(listingTable.id, listingId), eq(listingTable.status, "approved")),
    )
    .limit(1);
  return listing !== undefined;
};

// Keeping a listing twice changes nothing. Returns whether it was new.
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
    .onConflictDoNothing()
    .returning({ listingId: favoriteListingsTable.listingId });

  return result.length > 0;
};

// The ids of every listing the buyer keeps, newest first.
export const favoriteListingIds = async (userId: number) => {
  const rows = await db
    .select({ listingId: favoriteListingsTable.listingId })
    .from(favoriteListingsTable)
    .where(eq(favoriteListingsTable.buyerId, userId))
    .orderBy(
      desc(favoriteListingsTable.createdAt),
      desc(favoriteListingsTable.listingId),
    );
  return rows.map(({ listingId }) => listingId);
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

// Whether the listing's car has a completed inspection.
const hasCompletedInspection = sql<boolean>`exists (
  select 1 from ${inspectionTable}
  where ${inspectionTable.carId} = ${carTable.id}
    and ${inspectionTable.status} = 'completed'
)`;

// The id breaks ties so pages stay stable.
const favoritesOrderBy = {
  recent: [desc(favoriteListingsTable.createdAt), desc(listingTable.id)],
  price_asc: [sql`${carTable.price} asc nulls last`, desc(listingTable.id)],
  price_desc: [sql`${carTable.price} desc nulls last`, desc(listingTable.id)],
} satisfies Record<QueryParams["sort"], SQL[]>;

// A page of the buyer's saved listings, with how many there are in all and
// how many are inspected. Listings that buyers can no longer see, such as
// sold ones, stay in the list with their status.
export const findFavoriteListings = async (
  userId: number,
  { page, limit, inspected, sort }: QueryParams,
) => {
  const saved = eq(favoriteListingsTable.buyerId, userId);
  const conditions = [saved];
  if (inspected !== undefined) {
    conditions.push(
      inspected ? hasCompletedInspection : not(hasCompletedInspection),
    );
  }

  const pageRows = await db
    .select({ id: listingTable.id, savedAt: favoriteListingsTable.createdAt })
    .from(favoriteListingsTable)
    .innerJoin(
      listingTable,
      eq(listingTable.id, favoriteListingsTable.listingId),
    )
    .leftJoin(carTable, eq(carTable.listingId, listingTable.id))
    .where(and(...conditions))
    .orderBy(...favoritesOrderBy[sort])
    .limit(limit)
    .offset((page - 1) * limit);

  const [totals] = await db
    .select({
      total: sql<number>`count(*) filter (where ${and(...conditions)})`.mapWith(
        Number,
      ),
      all: count(),
      inspected:
        sql<number>`count(*) filter (where ${hasCompletedInspection})`.mapWith(
          Number,
        ),
    })
    .from(favoriteListingsTable)
    .innerJoin(
      listingTable,
      eq(listingTable.id, favoriteListingsTable.listingId),
    )
    .leftJoin(carTable, eq(carTable.listingId, listingTable.id))
    .where(saved);

  const counts = {
    total: totals?.total ?? 0,
    all: totals?.all ?? 0,
    inspected: totals?.inspected ?? 0,
  };
  const pageIds = pageRows.map(({ id }) => id);
  if (pageIds.length === 0) {
    return { listings: [], counts };
  }

  const found = await db.query.listingTable.findMany({
    columns: { id: true, title: true, status: true },
    with: { car: listingCardCar },
    where: inArray(listingTable.id, pageIds),
  });
  const byId = new Map(found.map((listing) => [listing.id, listing]));
  const scores = await latestInspectionScores(pageIds);
  const listings = pageRows.flatMap(({ id, savedAt }) => {
    const listing = byId.get(id);
    return listing
      ? [{ ...listing, savedAt, inspectionScore: scores.get(id) ?? null }]
      : [];
  });

  return { listings, counts };
};

import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { mechanicReviewTable } from "../../db/schema/mechanic_review";
import { mechanicTable } from "../../db/schema/mechanic";
import { createReviewSchema, updateReviewSchema } from "./request_schema";

type CreateReviewData = z.infer<typeof createReviewSchema>;
type UpdateReviewData = z.infer<typeof updateReviewSchema>;

export const findReviewByMechanicAndBuyer = async (
  mechanicId: number,
  buyerId: number,
) => {
  const review = await db.query.mechanicReviewTable.findFirst({
    where: and(
      eq(mechanicReviewTable.mechanicId, mechanicId),
      eq(mechanicReviewTable.buyerId, buyerId),
    ),
  });

  return review ?? null;
};

export const findReviewsByMechanic = async (
  mechanicId: number,
  { page, limit }: { page: number; limit: number },
) => {
  const condition = eq(mechanicReviewTable.mechanicId, mechanicId);
  const reviews = await db.query.mechanicReviewTable.findMany({
    where: condition,
    with: {
      buyer: {
        columns: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: desc(mechanicReviewTable.createdAt),
    limit,
    offset: (page - 1) * limit,
  });
  const totalCountResult = await db
    .select({ count: count() })
    .from(mechanicReviewTable)
    .where(condition);

  return { reviews, totalCountResult };
};

export const getRatingSummaryForMechanic = async (mechanicId: number) => {
  const [summary] = await db
    .select({
      average: avg(mechanicReviewTable.rating),
      count: count(),
    })
    .from(mechanicReviewTable)
    .where(eq(mechanicReviewTable.mechanicId, mechanicId));

  const perRating = await db
    .select({ rating: mechanicReviewTable.rating, count: count() })
    .from(mechanicReviewTable)
    .where(eq(mechanicReviewTable.mechanicId, mechanicId))
    .groupBy(mechanicReviewTable.rating);
  // How many reviews give each number of stars, from 1 to 5.
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of perRating) {
    if (row.rating in distribution) {
      distribution[row.rating as keyof typeof distribution] = row.count;
    }
  }

  return {
    average: summary?.average ? Number(summary.average) : null,
    count: summary?.count ?? 0,
    distribution,
  };
};

export const insertReview = async (
  mechanicId: number,
  buyerId: number,
  data: CreateReviewData,
) => {
  const [review] = await db
    .insert(mechanicReviewTable)
    .values({ mechanicId, buyerId, ...data })
    .returning();

  return review;
};

export const updateReviewByBuyer = async (
  mechanicId: number,
  buyerId: number,
  data: UpdateReviewData,
) => {
  const [review] = await db
    .update(mechanicReviewTable)
    .set({ ...data, updatedAt: new Date().toISOString().slice(0, 10) })
    .where(
      and(
        eq(mechanicReviewTable.mechanicId, mechanicId),
        eq(mechanicReviewTable.buyerId, buyerId),
      ),
    )
    .returning();

  return review ?? null;
};

export const deleteReviewByBuyer = async (
  mechanicId: number,
  buyerId: number,
) => {
  const [review] = await db
    .delete(mechanicReviewTable)
    .where(
      and(
        eq(mechanicReviewTable.mechanicId, mechanicId),
        eq(mechanicReviewTable.buyerId, buyerId),
      ),
    )
    .returning();

  return review ?? null;
};

export const findMechanicRankingsByCity = async (
  cityId: number,
  { page, limit }: { page: number; limit: number },
) => {
  const averageRatingExpr = avg(mechanicReviewTable.rating);
  const reviewCountExpr = count(mechanicReviewTable.id);
  const condition = and(
    eq(mechanicTable.cityId, cityId),
    eq(mechanicTable.isActive, true),
  );

  const rankings = await db
    .select({
      mechanicId: mechanicTable.id,
      name: mechanicTable.name,
      cityId: mechanicTable.cityId,
      address: mechanicTable.address,
      latitude: mechanicTable.latitude,
      longitude: mechanicTable.longitude,
      inspectionPrice: mechanicTable.inspectionPrice,
      profileImageUrl: mechanicTable.profileImageUrl,
      averageRating: averageRatingExpr,
      reviewCount: reviewCountExpr,
    })
    .from(mechanicTable)
    .leftJoin(
      mechanicReviewTable,
      eq(mechanicReviewTable.mechanicId, mechanicTable.id),
    )
    .where(condition)
    .groupBy(mechanicTable.id, mechanicTable.name, mechanicTable.cityId)
    .orderBy(
      sql`${averageRatingExpr} DESC NULLS LAST`,
      desc(reviewCountExpr),
      mechanicTable.id,
    )
    .limit(limit)
    .offset((page - 1) * limit);

  const totalCountResult = await db
    .select({ count: count() })
    .from(mechanicTable)
    .where(condition);

  return {
    rankings: rankings.map((row) => ({
      mechanicId: row.mechanicId,
      name: row.name,
      cityId: row.cityId,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      inspectionPrice: row.inspectionPrice,
      profileImageUrl: row.profileImageUrl,
      averageRating: row.averageRating ? Number(row.averageRating) : null,
      reviewCount: Number(row.reviewCount),
    })),
    totalCountResult,
  };
};

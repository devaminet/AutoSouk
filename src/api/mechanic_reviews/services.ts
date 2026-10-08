import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { NotFoundError } from "../../errors/not_found_error";
import { findMechanicById } from "../mechanics/db";
import {
  deleteReviewByBuyer,
  findMechanicRankingsByCity,
  findReviewByMechanicAndBuyer,
  findReviewsByMechanic,
  getRatingSummaryForMechanic,
  insertReview,
  updateReviewByBuyer,
} from "./db";
import {
  createReviewSchema,
  mechanicRankingsQuerySchema,
  reviewsQuerySchema,
  updateReviewSchema,
} from "./request_schema";

type CreateReviewData = z.infer<typeof createReviewSchema>;
type UpdateReviewData = z.infer<typeof updateReviewSchema>;
type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;
type MechanicRankingsQuery = z.infer<typeof mechanicRankingsQuerySchema>;

const requireMechanic = async (mechanicId: number) => {
  const mechanic = await findMechanicById(mechanicId);
  if (!mechanic) {
    throw new NotFoundError("Mechanic profile was not found");
  }

  return mechanic;
};

const formatReview = (review: {
  id: number;
  rating: number;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  buyer?: { id: number; firstName: string; lastName: string };
}) => ({
  id: review.id,
  rating: review.rating,
  message: review.message,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  ...(review.buyer
    ? {
        buyer: {
          id: review.buyer.id,
          name: `${review.buyer.firstName} ${review.buyer.lastName}`,
        },
      }
    : {}),
});

export const getMechanicRatingSummary = async (mechanicId: number) =>
  getRatingSummaryForMechanic(mechanicId);

export const createMechanicReview = async (
  mechanicId: number,
  buyerId: number,
  data: CreateReviewData,
) => {
  await requireMechanic(mechanicId);

  const existingReview = await findReviewByMechanicAndBuyer(
    mechanicId,
    buyerId,
  );
  if (existingReview) {
    throw new BadRequestError("You have already reviewed this mechanic");
  }

  const review = await insertReview(mechanicId, buyerId, data);
  return formatReview(review);
};

export const getMechanicReviews = async (
  mechanicId: number,
  query: ReviewsQuery,
) => {
  await requireMechanic(mechanicId);

  const { reviews, totalCountResult } = await findReviewsByMechanic(
    mechanicId,
    query,
  );
  const rating = await getRatingSummaryForMechanic(mechanicId);
  const total = totalCountResult[0]?.count ?? 0;

  return {
    reviews: reviews.map(formatReview),
    rating,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const updateMechanicReview = async (
  mechanicId: number,
  buyerId: number,
  data: UpdateReviewData,
) => {
  await requireMechanic(mechanicId);

  const updated = await updateReviewByBuyer(mechanicId, buyerId, data);
  if (!updated) {
    throw new NotFoundError("Review was not found");
  }

  return formatReview(updated);
};

export const deleteMechanicReview = async (
  mechanicId: number,
  buyerId: number,
) => {
  await requireMechanic(mechanicId);

  const deleted = await deleteReviewByBuyer(mechanicId, buyerId);
  if (!deleted) {
    throw new NotFoundError("Review was not found");
  }

  return { deleted: true, reviewId: deleted.id };
};

export const rankMechanicsByCity = async (query: MechanicRankingsQuery) => {
  const { rankings, totalCountResult } = await findMechanicRankingsByCity(
    query.cityId,
    query,
  );
  const total = totalCountResult[0]?.count ?? 0;

  return {
    rankings,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

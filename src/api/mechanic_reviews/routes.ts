import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isBuyer } from "../../middlewares/is_buyer";
import {
  createMechanicReview,
  deleteMechanicReview,
  getMechanicReviews,
  updateMechanicReview,
} from "./services";
import {
  createReviewSchema,
  mechanicIdParamSchema,
  reviewsQuerySchema,
  updateReviewSchema,
} from "./request_schema";

const mechanicReviewsRouter = Router();

/**
 * @openapi
 * /api/mechanics/{mechanicId}/reviews:
 *   post:
 *     tags: [Mechanic Reviews]
 *     summary: Submit a review for a mechanic (one review per buyer)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mechanicId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               message: { type: string, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: Review created
 *       400:
 *         description: Validation error, NSFW content, or a review already exists
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 *       404:
 *         description: Mechanic not found
 */
mechanicReviewsRouter.post(
  "/:mechanicId/reviews",
  isAuthenticated,
  isBuyer,
  async (req, res) => {
    const paramsResult = mechanicIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new RequestValidationError(paramsResult.error.errors);
    }

    const bodyResult = createReviewSchema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new RequestValidationError(bodyResult.error.errors);
    }

    const review = await createMechanicReview(
      paramsResult.data.mechanicId,
      req.currentUser!.id,
      bodyResult.data,
    );
    res.status(201).json({ review });
  },
);

/**
 * @openapi
 * /api/mechanics/{mechanicId}/reviews:
 *   get:
 *     tags: [Mechanic Reviews]
 *     summary: List a mechanic's reviews and overall rating
 *     parameters:
 *       - in: path
 *         name: mechanicId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Reviews and rating summary
 *       400:
 *         description: Validation error
 *       404:
 *         description: Mechanic not found
 */
mechanicReviewsRouter.get("/:mechanicId/reviews", async (req, res) => {
  const paramsResult = mechanicIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    throw new RequestValidationError(paramsResult.error.errors);
  }

  const queryResult = reviewsQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    throw new RequestValidationError(queryResult.error.errors);
  }

  const result = await getMechanicReviews(
    paramsResult.data.mechanicId,
    queryResult.data,
  );
  res.status(200).json(result);
});

/**
 * @openapi
 * /api/mechanics/{mechanicId}/reviews/me:
 *   patch:
 *     tags: [Mechanic Reviews]
 *     summary: Update the current buyer's review for a mechanic
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mechanicId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               message: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Review updated
 *       400:
 *         description: Validation error or NSFW content
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 *       404:
 *         description: Mechanic or review not found
 */
mechanicReviewsRouter.patch(
  "/:mechanicId/reviews/me",
  isAuthenticated,
  isBuyer,
  async (req, res) => {
    const paramsResult = mechanicIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new RequestValidationError(paramsResult.error.errors);
    }

    const bodyResult = updateReviewSchema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new RequestValidationError(bodyResult.error.errors);
    }

    const review = await updateMechanicReview(
      paramsResult.data.mechanicId,
      req.currentUser!.id,
      bodyResult.data,
    );
    res.status(200).json({ review });
  },
);

/**
 * @openapi
 * /api/mechanics/{mechanicId}/reviews/me:
 *   delete:
 *     tags: [Mechanic Reviews]
 *     summary: Delete the current buyer's review for a mechanic
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mechanicId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Review deleted
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 *       404:
 *         description: Mechanic or review not found
 */
mechanicReviewsRouter.delete(
  "/:mechanicId/reviews/me",
  isAuthenticated,
  isBuyer,
  async (req, res) => {
    const paramsResult = mechanicIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new RequestValidationError(paramsResult.error.errors);
    }

    const result = await deleteMechanicReview(
      paramsResult.data.mechanicId,
      req.currentUser!.id,
    );
    res.status(200).json(result);
  },
);

export default mechanicReviewsRouter;

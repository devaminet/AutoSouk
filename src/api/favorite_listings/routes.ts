import { Router } from "express";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isBuyer } from "../../middlewares/is_buyer";
import {
  createFavoriteListingSchema,
  getFavoriteListingSchema,
  removeFavoriteListingSchema,
} from "./request_schema";
import { RequestValidationError } from "../../errors/request_validation_error";
import {
  favorListing,
  getUserFavoriteListings,
  removeFavorite,
} from "./services";

const favoriteListingRouter = Router();

/**
 * @openapi
 * /api/favorite_listings:
 *   get:
 *     tags: [Favorite Listings]
 *     summary: Get the current buyer's favorite listings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: List of favorite listings
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 */
favoriteListingRouter.get("/", isAuthenticated, isBuyer, async (req, res) => {
  const validationResult = getFavoriteListingSchema.safeParse(req.query);
  let limit = validationResult.success ? validationResult.data.limit : 10;
  let offset = validationResult.success ? validationResult.data.offset : 1;
  const listings = await getUserFavoriteListings(req.currentUser?.id!, {
    limit,
    offset,
  });
  res.status(200).json({ listings });
});

/**
 * @openapi
 * /api/favorite_listings:
 *   post:
 *     tags: [Favorite Listings]
 *     summary: Add a listing to favorites
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listingId]
 *             properties:
 *               listingId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Favorite created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 */
favoriteListingRouter.post("/", isAuthenticated, isBuyer, async (req, res) => {
  const validationResult = createFavoriteListingSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const result = await favorListing({
    userId: req.currentUser?.id!,
    listingId: validationResult.data.listingId,
  });

  res.status(201).json(result);
});

/**
 * @openapi
 * /api/favorite_listings/{listingId}:
 *   delete:
 *     tags: [Favorite Listings]
 *     summary: Remove a listing from favorites
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: listingId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Favorite removed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 */
favoriteListingRouter.delete(
  "/:listingId",
  isAuthenticated,
  isBuyer,
  async (req, res) => {
    const validationResult = removeFavoriteListingSchema.safeParse(req.params);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }
    const result = await removeFavorite({
      userId: req.currentUser?.id!,
      listingId: validationResult.data.listingId,
    });

    res.status(200).json(result);
  },
);

export default favoriteListingRouter;

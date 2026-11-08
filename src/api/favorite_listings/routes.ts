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
  getFavoriteListingIds,
  getUserFavoriteListings,
  removeFavorite,
} from "./services";

const favoriteListingRouter = Router();

/**
 * @openapi
 * /api/favorite_listings:
 *   get:
 *     tags: [Favorite Listings]
 *     summary: Get a page of the current buyer's saved listings
 *     description: >
 *       Each listing has the same card details as GET /api/listings, plus its
 *       `status` and `savedAt`. Listings buyers can no longer see, such as sold
 *       ones, stay in the list with their status. `counts` covers every saved
 *       listing, whatever the filter.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 12 }
 *       - in: query
 *         name: inspected
 *         description: "true for listings whose car has a completed inspection, false for the others"
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [recent, price_asc, price_desc]
 *           default: recent
 *       - in: query
 *         name: cityId
 *         description: Only listings whose car is in this city
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: A page of saved listings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       title: { type: string }
 *                       status:
 *                         type: string
 *                         enum: [draft, pending, approved, withdrawn, rejected, sold]
 *                       savedAt: { type: string, format: date-time }
 *                       inspectionScore: { type: integer, nullable: true }
 *                       car:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id: { type: integer }
 *                           makeId: { type: integer }
 *                           modelId: { type: integer }
 *                           price: { type: integer }
 *                           year: { type: integer }
 *                           distance: { type: string }
 *                           transmission: { type: string, enum: [manual, automatic] }
 *                           carburant:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               carburant: { type: string }
 *                           carMedias:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 type: { type: string }
 *                                 link: { type: string }
 *                                 isPrimary: { type: boolean }
 *                           city:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               name: { type: string }
 *                               slug: { type: string }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalPages: { type: integer }
 *                 counts:
 *                   type: object
 *                   properties:
 *                     all: { type: integer }
 *                     inspected: { type: integer }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 */
favoriteListingRouter.get("/", isAuthenticated, isBuyer, async (req, res) => {
  const validationResult = getFavoriteListingSchema.safeParse(req.query);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  res
    .status(200)
    .json(
      await getUserFavoriteListings(
        req.currentUser?.id!,
        validationResult.data,
      ),
    );
});

/**
 * @openapi
 * /api/favorite_listings/ids:
 *   get:
 *     tags: [Favorite Listings]
 *     summary: Get the ids of every listing the current buyer keeps
 *     description: Light enough to mark favourites on listing cards. Newest first.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The listing ids
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listingIds:
 *                   type: array
 *                   items: { type: integer }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 */
favoriteListingRouter.get(
  "/ids",
  isAuthenticated,
  isBuyer,
  async (req, res) => {
    res.status(200).json(await getFavoriteListingIds(req.currentUser?.id!));
  },
);

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
 *         description: "Favorite created. Body is `{ listingId, created: true }`."
 *       200:
 *         description: "The listing was already a favorite. Body is `{ listingId, created: false }`."
 *       400:
 *         description: Validation error
 *       404:
 *         description: No approved listing has this id (`listing.not_found`)
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

  res.status(result.created ? 201 : 200).json(result);
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
 *         description: >
 *           The listing is no longer a favorite. `count` is 1 when it was
 *           removed, and 0 when it wasn't a favorite.
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

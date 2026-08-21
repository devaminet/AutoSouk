import { Router } from "express";
import isAuthenticated from "../../middlewares/is-authenticated";
import { isBuyer } from "../../middlewares/is-buyer";
import {
  createFavoriteListingSchema,
  getFavoriteListingSchema,
  removeFavoriteListingSchema,
} from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import {
  favorListing,
  getUserFavoriteListings,
  removeFavorite,
} from "./services";

const favoriteListingRouter = Router();

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

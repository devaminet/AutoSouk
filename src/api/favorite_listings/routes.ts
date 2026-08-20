import { Router } from "express";
import isAuthenticated from "../../middlewares/is-authenticated";
import { isBuyer } from "../../middlewares/is-buyer";
import { createOrRemoveFavoriteListingSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import { favorListing, removeFavorite } from "./services";

const favoriteListingRouter = Router();

favoriteListingRouter.post("/", isAuthenticated, isBuyer, async (req, res) => {
  const validationResult = createOrRemoveFavoriteListingSchema.safeParse(
    req.body,
  );
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
  "/",
  isAuthenticated,
  isBuyer,
  async (req, res) => {
    const validationResult = createOrRemoveFavoriteListingSchema.safeParse(
      req.body,
    );
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

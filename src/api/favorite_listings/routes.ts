import { Router } from "express";
import isAuthenticated from "../../middlewares/is-authenticated";
import { isBuyer } from "../../middlewares/is-buyer";
import { createFavoriteListingSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import { favorListing } from "./services";

const favoriteListingRouter = Router();

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

export default favoriteListingRouter;

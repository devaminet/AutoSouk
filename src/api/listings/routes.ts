import { Router, Request, Response } from "express";
import {
  attachListingParamSchema,
  createCarSchema,
  createListingSchema,
  getListingsQuerySchema,
} from "./request_schema";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import {
  approveListing,
  getListingDetails,
  saveListing,
  getListings,
  deleteListing,
  attachCarToListing,
} from "./services";
import { isAdmin } from "../../middlewares/is_admin";
import { isSeller } from "../../middlewares/is_seller";

const listingRouter = Router();

// Get public listings (paginated, filtered)
listingRouter.get("/", async (req: Request, res: Response) => {
  const validationResult = getListingsQuerySchema.safeParse(req.query);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await getListings(validationResult.data);
  res.status(200).json(result);
});

// Create a listing
listingRouter.post(
  "/",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const validationResult = createListingSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }
    const { title, description } = validationResult.data;
    const result = await saveListing(title, description, req.currentUser?.id!);
    res.status(201).json({ listing: result });
  },
);

// Attach car to a listing
listingRouter.post(
  "/:id/car",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const requestParamValidation = attachListingParamSchema.safeParse(
      req.params,
    );
    if (!requestParamValidation.success) {
      throw new RequestValidationError(requestParamValidation.error.errors);
    }
    const validateResult = createCarSchema.safeParse(req.body);
    if (!validateResult.success) {
      throw new RequestValidationError(validateResult.error.errors);
    }
    const listingId = requestParamValidation.data.id;
    const { car, carMedia } = await attachCarToListing(
      validateResult.data,
      listingId,
      req.currentUser?.id!,
    );

    res.status(201).json({ ...car, carMedia });
  },
);

// Get listing data by id
listingRouter.get(
  "/:id",
  // isAuthenticated,
  async (req: Request, res: Response) => {
    const listing = await getListingDetails(+req.params.id);
    res.status(200).json({ listing });
  },
);

// Approve a listing
listingRouter.patch(
  "/:id/approve",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    const listingId = +req.params.id;
    const result = await approveListing(listingId);
    res.status(200).json({ updatedRows: result });
  },
);

// Delete a listing
listingRouter.delete(
  "/:id",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const listingId = +req.params.id;
    const result = await deleteListing(listingId, req.currentUser?.id!);
    res.status(200).json(result);
  },
);

export default listingRouter;

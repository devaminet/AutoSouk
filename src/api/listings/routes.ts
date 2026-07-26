import { Router, Request, Response } from "express";
import { createCarSchema, createListingSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import isAuthenticated from "../../middlewares/is-authenticated";
import { NotFoundError } from "../../errors/not-found-error";
import { generatePresignedUrls } from "../../utils/functions";
import { carBucketName } from "../../utils/constants";
import {
  approveListing,
  getListingDetails,
  getUserListing,
  saveCarAndMedia,
  saveListing,
} from "./services";
import { isAdmin } from "../../middlewares/is-admin";
import { isSeller } from "../../middlewares/is-seller";

const listingRouter = Router();

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
    const validateResult = createCarSchema.safeParse(req.body);
    if (!validateResult.success) {
      throw new RequestValidationError(validateResult.error.errors);
    }
    const listingId = +req.params.id;
    const listing = await getUserListing(listingId, req.currentUser?.id!);
    if (!listing) {
      throw new NotFoundError("Listing was not found");
    }

    const { filenames, ...carDetails } = validateResult.data;
    const urlsMap = await generatePresignedUrls(carBucketName, filenames);
    const car = await saveCarAndMedia({
      carDetails,
      filenames,
      urlsMap,
      listingId,
      userId: req.currentUser?.id!,
    });

    res.status(201).json({ car });
  },
);

// Get listing data by id
listingRouter.get(
  "/:id",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const listing = await getListingDetails(+req.params.id);
    if (!listing) {
      throw new NotFoundError("Listing was not found!");
    }

    const carMedias = listing.car?.carMedias;
    if (carMedias) {
      const filenames = carMedias.map((media) => media.link);
      const urlsMap = await generatePresignedUrls(carBucketName, filenames);
      for (const media of carMedias) {
        media.link = urlsMap.get(media.link) || "";
      }
    }

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

export default listingRouter;

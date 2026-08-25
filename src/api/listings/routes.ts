import { Router, Request, Response } from "express";
import {
  createCarSchema,
  createListingSchema,
  getListingsQuerySchema,
} from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import isAuthenticated from "../../middlewares/is-authenticated";
import { NotFoundError } from "../../errors/not-found-error";
import {
  generateGetPresignedUrls,
  generatePresignedUrl,
} from "../../utils/functions";
import { carBucketName } from "../../utils/constants";
import {
  approveListing,
  getListingDetails,
  getUserListing,
  saveCarAndMedia,
  saveListing,
  getListings,
  deleteListing,
} from "./services";
import { isAdmin } from "../../middlewares/is-admin";
import { isSeller } from "../../middlewares/is-seller";
import { InternalServerError } from "../../errors/internal-server-error";

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
    const validateResult = createCarSchema.safeParse(req.body);
    if (!validateResult.success) {
      throw new RequestValidationError(validateResult.error.errors);
    }
    const listingId = +req.params.id;
    const listing = await getUserListing(listingId, req.currentUser?.id!);
    if (!listing) {
      throw new NotFoundError("Listing was not found");
    }

    const { files, ...carDetails } = validateResult.data;
    const filenamesPromises = files.map((file) => {
      return new Promise<{
        signedUrl: string;
        isPrimary: boolean;
        filename: string;
      }>((resolve, reject) => {
        generatePresignedUrl(carBucketName, file.name)
          .then((value) =>
            resolve({
              signedUrl: value,
              isPrimary: file.isPrimary,
              filename: file.name,
            }),
          )
          .catch(() =>
            reject(
              new InternalServerError(
                `Could not generate url for this image: ${file.name}`,
              ),
            ),
          );
      });
    });

    let carMedia: Awaited<(typeof filenamesPromises)[number]>[] = [];
    try {
      carMedia = await Promise.all(filenamesPromises);
    } catch (error) {
      throw new InternalServerError("Could not generate urls for images");
    }

    const car = await saveCarAndMedia({
      carDetails,
      carMedia,
      listingId,
      userId: req.currentUser?.id!,
    });

    res.status(201).json({ ...car, carMedia });
  },
);

// Get listing data by id
listingRouter.get(
  "/:id",
  // isAuthenticated,
  async (req: Request, res: Response) => {
    const listing = await getListingDetails(+req.params.id);
    if (!listing) {
      throw new NotFoundError("Listing was not found!");
    }

    const carMedias = listing.car?.carMedias;
    if (carMedias) {
      const filenames = carMedias.map((media) => media.link);
      const urlsMap = await generateGetPresignedUrls(carBucketName, filenames);
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

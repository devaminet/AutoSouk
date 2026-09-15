import { Router, Request, Response } from "express";
import {
  attachListingParamSchema,
  createCarSchema,
  createListingSchema,
  getListingsQuerySchema,
} from "./request_schema";
import { listingMechanicsQuerySchema } from "../mechanics/request_schema";
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
import { getMechanicsForListing } from "../mechanics/services";
import { isAdmin } from "../../middlewares/is_admin";
import { isSeller } from "../../middlewares/is_seller";

const listingRouter = Router();

/**
 * @openapi
 * /api/listings:
 *   get:
 *     tags: [Listings]
 *     summary: Get public listings (paginated, filtered)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: makeId
 *         schema: { type: integer }
 *       - in: query
 *         name: modelId
 *         schema: { type: integer }
 *       - in: query
 *         name: cityId
 *         schema: { type: integer }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [price_asc, price_desc, newest, oldest]
 *           default: newest
 *     responses:
 *       200:
 *         description: Paginated list of listings
 *       400:
 *         description: Validation error
 */
// Get public listings (paginated, filtered)
listingRouter.get("/", async (req: Request, res: Response) => {
  const validationResult = getListingsQuerySchema.safeParse(req.query);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await getListings(validationResult.data);
  res.status(200).json(result);
});

/**
 * @openapi
 * /api/listings:
 *   post:
 *     tags: [Listings]
 *     summary: Create a listing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Listing created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 */
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

/**
 * @openapi
 * /api/listings/{id}/car:
 *   post:
 *     tags: [Listings]
 *     summary: Attach a car to a listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [makeId, modelId, carburantId, originId, stateId, price, year, ownersCount, cityId, distance, transmission, fiscalPower, doorsNumber, files]
 *             properties:
 *               makeId: { type: integer }
 *               modelId: { type: integer }
 *               carburantId: { type: integer }
 *               originId: { type: integer }
 *               stateId: { type: integer }
 *               price: { type: number }
 *               year: { type: integer }
 *               ownersCount: { type: integer }
 *               cityId: { type: integer }
 *               distance: { type: string }
 *               transmission: { type: string, enum: [manual, automatic] }
 *               fiscalPower: { type: integer }
 *               doorsNumber: { type: integer }
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     isPrimary: { type: boolean }
 *     responses:
 *       201:
 *         description: Car attached to listing
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
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

/**
 * @openapi
 * /api/listings/{id}/mechanics:
 *   get:
 *     tags: [Listings]
 *     summary: Get active mechanics for an approved listing's city
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: List of mechanics
 *       400:
 *         description: Validation error
 */
// Get active mechanics for an approved listing's city
listingRouter.get("/:id/mechanics", async (req: Request, res: Response) => {
  const paramsValidation = attachListingParamSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    throw new RequestValidationError(paramsValidation.error.errors);
  }

  const queryValidation = listingMechanicsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    throw new RequestValidationError(queryValidation.error.errors);
  }

  const result = await getMechanicsForListing(
    paramsValidation.data.id,
    queryValidation.data,
  );
  res.status(200).json(result);
});

/**
 * @openapi
 * /api/listings/{id}:
 *   get:
 *     tags: [Listings]
 *     summary: Get listing data by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listing details
 *       404:
 *         description: Listing not found
 */
// Get listing data by id
listingRouter.get(
  "/:id",
  // isAuthenticated,
  async (req: Request, res: Response) => {
    const listing = await getListingDetails(+req.params.id);
    res.status(200).json({ listing });
  },
);

/**
 * @openapi
 * /api/listings/{id}/approve:
 *   patch:
 *     tags: [Listings]
 *     summary: Approve a listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listing approved
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
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

/**
 * @openapi
 * /api/listings/{id}:
 *   delete:
 *     tags: [Listings]
 *     summary: Delete a listing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listing deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not the owning seller
 */
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

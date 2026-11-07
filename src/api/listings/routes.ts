import { Router, Request, Response } from "express";
import {
  addCarMediaSchema,
  attachListingParamSchema,
  deleteCarMediaSchema,
  listingMediaParamSchema,
  createCarSchema,
  createListingSchema,
  getListingsQuerySchema,
  getMyListingsQuerySchema,
  getPendingListingsQuerySchema,
  rejectListingSchema,
  updateListingSchema,
} from "./request_schema";
import { listingMechanicsQuerySchema } from "../mechanics/request_schema";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import {
  approveListing,
  getListingDetails,
  saveListing,
  getListings,
  getMyListings,
  getPendingListings,
  rejectListing,
  deleteListing,
  attachCarToListing,
  confirmListingMedia,
  addListingMedia,
  deleteListingMedia,
  setListingPrimaryMedia,
  submitListing,
  updateListing,
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
 *         name: equipmentIds
 *         description: Only cars that have all of these equipment ids from GET /api/equipment. Comma separated (equipmentIds=3,7) or repeated (equipmentIds=3&equipmentIds=7), at most 100.
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           maxItems: 100
 *           items: { type: integer }
 *       - in: query
 *         name: transmission
 *         schema:
 *           type: string
 *           enum: [manual, automatic]
 *       - in: query
 *         name: carburantIds
 *         description: Only cars with one of these fuel ids from GET /api/lookups. Comma separated (carburantIds=1,2) or repeated, at most 20.
 *         style: form
 *         explode: false
 *         schema:
 *           type: array
 *           maxItems: 20
 *           items: { type: integer }
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [price_asc, price_desc, newest, oldest]
 *           default: newest
 *     responses:
 *       200:
 *         description: >
 *           Paginated list of approved listings. Each car has its make and
 *           model ids, price, year, distance, transmission and fuel slug
 *           (`carburant.carburant`).
 *           `inspectionScore` is the 0-100 score of the car's latest completed
 *           inspection, or null when it has none.
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
 * /api/listings/pending:
 *   get:
 *     tags: [Listings]
 *     summary: List the listings waiting for approval
 *     description: The moderation queue, the longest waiting first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: Pending listings, in the same shape as /api/listings/mine, with the seller as `user`
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
// Declared before "/:id" so that "pending" is not read as a listing id.
listingRouter.get(
  "/pending",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    const validationResult = getPendingListingsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }

    const result = await getPendingListings(validationResult.data);
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/listings/mine:
 *   get:
 *     tags: [Listings]
 *     summary: List the seller's own listings, in every status
 *     description: >
 *       Newest first. A draft may have no car yet, so `car` can be null.
 *       `car.carMedias` lists uploaded media, primary first.
 *       `meta.statusCounts` counts all of the seller's listings per status and
 *       ignores the `status` filter, so it can label every tab.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, pending, approved, withdrawn, rejected, sold]
 *     responses:
 *       200:
 *         description: The seller's listings
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
 *                       description: { type: string }
 *                       status: { type: string, description: "Translate with enums:listing_status.<status>" }
 *                       approvedAt: { type: string, format: date, nullable: true }
 *                       rejectionReason: { type: string, nullable: true, description: "Why an admin rejected the listing; cleared when the seller edits it" }
 *                       createdAt: { type: string, format: date }
 *                       updatedAt: { type: string, format: date }
 *                       completedInspectionsCount: { type: integer, description: "Completed inspections of the listing's car; 0 without a car" }
 *                       car:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id: { type: integer }
 *                           price: { type: integer }
 *                           year: { type: integer }
 *                           distance: { type: string }
 *                           make: { type: object, properties: { name: { type: string } } }
 *                           model: { type: object, properties: { name: { type: string } } }
 *                           city: { type: object, properties: { name: { type: string }, slug: { type: string } } }
 *                           carMedias:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: integer }
 *                                 type: { type: string, enum: [image, video] }
 *                                 link: { type: string, description: Presigned download URL }
 *                                 isPrimary: { type: boolean }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalPages: { type: integer }
 *                     statusCounts:
 *                       type: object
 *                       description: Listings of this seller per status, 0 included. Ignores the status filter.
 *                       properties:
 *                         draft: { type: integer }
 *                         pending: { type: integer }
 *                         approved: { type: integer }
 *                         withdrawn: { type: integer }
 *                         rejected: { type: integer }
 *                         sold: { type: integer }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 */
// Declared before "/:id" so that "mine" is not read as a listing id.
listingRouter.get(
  "/mine",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const validationResult = getMyListingsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }

    const result = await getMyListings(
      req.currentUser!.id,
      validationResult.data,
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/listings:
 *   post:
 *     tags: [Listings]
 *     summary: Create a draft listing
 *     description: >
 *       First step of a new listing. Then attach the car with POST
 *       /api/listings/{id}/car, add media with POST /api/listings/{id}/media,
 *       upload it, call POST /api/listings/{id}/media/confirm, and send the
 *       draft to review with POST /api/listings/{id}/submit.
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
 *                 minLength: 1
 *                 description: Surrounding spaces are removed before it is checked and stored, so a value of only spaces is refused.
 *               description:
 *                 type: string
 *                 minLength: 1
 *                 description: Surrounding spaces are removed before it is checked and stored, so a value of only spaces is refused.
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
 *     summary: Attach a car to a draft listing
 *     description: Saves the car details. Only a draft accepts a car, otherwise the answer is 400 with the code `listing.not_draft`. The listing stays a draft until POST /api/listings/{id}/submit.
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
 *             required: [makeId, modelId, carburantId, originId, stateId, price, year, ownersCount, cityId, distance, transmission, fiscalPower, doorsNumber]
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
 *               equipmentIds:
 *                 type: array
 *                 description: Optional ids from GET /api/equipment. Unique, at most 100. Unknown ids return 400 with field equipmentIds.
 *                 maxItems: 100
 *                 uniqueItems: true
 *                 items: { type: integer }
 *     responses:
 *       201:
 *         description: Car attached. Returns the car row with the saved equipmentIds.
 *       400:
 *         description: Validation error, the listing is not a draft, or a car is already attached
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller
 */
// Attach car to a listing
listingRouter.post(
  "/:id/car",
  isAuthenticated,
  isSeller,
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
    const car = await attachCarToListing(
      validateResult.data,
      listingId,
      req.currentUser?.id!,
    );

    res.status(201).json(car);
  },
);

/**
 * @openapi
 * /api/listings/{id}/media:
 *   post:
 *     tags: [Listings]
 *     summary: Add media to a listing's car
 *     description: Returns a presigned POST policy per file. Send a multipart/form-data POST to upload.url with every fields entry first and the file last as field "file". Images max 10MB (image/*), videos max 50MB (video/*), valid for 15 minutes. Then call POST /api/listings/{id}/media/confirm. Files that are not uploaded yet count towards the 20 file limit until they are confirmed or deleted. New media is never primary at creation; confirm sets the primary when the car has none.
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
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 description: File names must be unique within the request.
 *                 items:
 *                   type: object
 *                   required: [name]
 *                   properties:
 *                     name: { type: string, example: side.png }
 *     responses:
 *       201:
 *         description: Media created and waiting for upload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 carMedia:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       filename: { type: string }
 *                       originalName: { type: string }
 *                       upload:
 *                         type: object
 *                         properties:
 *                           url: { type: string }
 *                           fields: { type: object, additionalProperties: { type: string } }
 *       400:
 *         description: Validation error, more than 20 files on the car, or no car attached
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller
 */
// Add media to a listing's car
listingRouter.post(
  "/:id/media",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const paramValidation = attachListingParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const bodyValidation = addCarMediaSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      throw new RequestValidationError(bodyValidation.error.errors);
    }
    const carMedia = await addListingMedia(
      paramValidation.data.id,
      req.currentUser?.id!,
      bodyValidation.data.files,
    );
    res.status(201).json({ carMedia });
  },
);

/**
 * @openapi
 * /api/listings/{id}/media:
 *   delete:
 *     tags: [Listings]
 *     summary: Delete media from a listing's car
 *     description: >
 *       Deletes the given media of the seller's car. Outside a draft, the car
 *       must keep at least 3 uploaded images, so upload and confirm replacement
 *       images before deleting old ones. A draft has no minimum, and media that
 *       is not uploaded yet can always be deleted in any status: use the ids
 *       from the `pending` items of the confirm response. When the primary
 *       image is deleted, the oldest remaining uploaded image becomes primary.
 *       Deleting media does not change the listing status.
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
 *             required: [mediaIds]
 *             properties:
 *               mediaIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 uniqueItems: true
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Media deleted. Returns the deleted ids and the car's remaining uploaded media, primary first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: array
 *                   items: { type: integer }
 *                 carMedias:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       link: { type: string, description: Presigned download URL }
 *                       type: { type: string, enum: [image, video] }
 *                       isPrimary: { type: boolean }
 *       400:
 *         description: Validation error, media not on this car, fewer than 3 images would remain outside a draft, or no car attached
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller
 */
// Delete media from a listing's car
listingRouter.delete(
  "/:id/media",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const paramValidation = attachListingParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const bodyValidation = deleteCarMediaSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      throw new RequestValidationError(bodyValidation.error.errors);
    }
    const result = await deleteListingMedia(
      paramValidation.data.id,
      req.currentUser?.id!,
      bodyValidation.data.mediaIds,
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/listings/{id}/media/{mediaId}/primary:
 *   patch:
 *     tags: [Listings]
 *     summary: Make an uploaded image the primary media of a listing's car
 *     description: The previous primary media stops being primary. The listing keeps its approval status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: mediaId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Primary image changed. Returns the car's uploaded media, primary first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 carMedias:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       link: { type: string, description: Presigned download URL }
 *                       type: { type: string, enum: [image, video] }
 *                       isPrimary: { type: boolean }
 *       400:
 *         description: Invalid ids, the media is a video or not uploaded yet, or no car attached
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller, or media not found for its car
 */
// Make an uploaded image the primary media of a listing's car
listingRouter.patch(
  "/:id/media/:mediaId/primary",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const paramValidation = listingMediaParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const result = await setListingPrimaryMedia(
      paramValidation.data.id,
      req.currentUser?.id!,
      paramValidation.data.mediaId,
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/listings/{id}/media/confirm:
 *   post:
 *     tags: [Listings]
 *     summary: Confirm car media uploads for a listing
 *     description: Marks media found in storage as uploaded so it shows on the listing, and removes invalid files. If the car has no uploaded primary image, its oldest uploaded image becomes primary. Files still missing come back in `pending` with their id and a fresh upload policy, so the client can retry the upload or delete them with DELETE /api/listings/{id}/media. Newly uploaded media keeps a draft as a draft; any other status goes back to pending approval.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: The outcome per file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uploaded: { type: array, items: { type: string }, description: Filenames of all uploaded media }
 *                 rejected: { type: array, items: { type: string }, description: Filenames removed for a wrong type or size }
 *                 pending:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       filename: { type: string }
 *                       upload:
 *                         type: object
 *                         properties:
 *                           url: { type: string }
 *                           fields: { type: object, additionalProperties: { type: string } }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: No car media found for this seller's listing
 */
// Confirm uploaded media for a listing
listingRouter.post(
  "/:id/media/confirm",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const paramValidation = attachListingParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const result = await confirmListingMedia(
      paramValidation.data.id,
      req.currentUser?.id!,
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/listings/{id}/submit:
 *   post:
 *     tags: [Listings]
 *     summary: Send a complete draft to review
 *     description: >
 *       Requires a draft with an attached car, at least 3 uploaded images and
 *       an uploaded image as primary. Files that are not uploaded yet do not
 *       block it and stay hidden. Errors use the codes `listing.not_draft`,
 *       `listing.car_required`, `media.min_images` and `media.primary_required`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listing submitted, status set to pending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listing:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     status: { type: string, example: pending }
 *       400:
 *         description: Not a draft, no car attached, too few uploaded images, or no uploaded primary image
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller
 */
// Send a complete draft to review
listingRouter.post(
  "/:id/submit",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const paramValidation = attachListingParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const listing = await submitListing(
      paramValidation.data.id,
      req.currentUser?.id!,
    );
    res.status(200).json({ listing });
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
 *     description: >
 *       Approved listings are public. Any other status answers 404, except for
 *       the listing's seller and admins (send the bearer token), who also see
 *       `rejectionReason`. A draft may have no car yet, so `car` can be null.
 *       `car` carries the ids of its make, model, city, carburant, origin and
 *       state, so a form can show the saved choices, next to the nested
 *       objects used for display.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Listing details. car.carMedias lists uploaded media, primary first, then in upload order; use its id to delete media or change the primary image. car.equipment lists the car's equipment in catalog display order.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listing:
 *                   type: object
 *                   properties:
 *                     car:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         makeId: { type: integer, nullable: true, example: 449 }
 *                         modelId: { type: integer, nullable: true, example: 2085 }
 *                         cityId: { type: integer, nullable: true, example: 1 }
 *                         carburantId: { type: integer, nullable: true, example: 3 }
 *                         originId: { type: integer, nullable: true, example: 4 }
 *                         stateId: { type: integer, nullable: true, example: 6 }
 *                         city:
 *                           type: object
 *                           properties:
 *                             name: { type: string, example: Casablanca }
 *                             slug: { type: string, example: casablanca, description: "Translation key: enums:city.<slug>" }
 *                         carMedias:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: integer }
 *                               link: { type: string, description: Presigned download URL }
 *                               type: { type: string, enum: [image, video] }
 *                               isPrimary: { type: boolean }
 *                         equipment:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: integer }
 *                               slug: { type: string, example: panoramic_roof }
 *                               name: { type: string, example: Panoramic roof }
 *                               category:
 *                                 type: object
 *                                 properties:
 *                                   slug: { type: string, example: comfort }
 *                                   name: { type: string, example: Comfort }
 *       404:
 *         description: Listing not found, or not visible to the requester
 */
// Get listing data by id
listingRouter.get("/:id", async (req: Request, res: Response) => {
  const listing = await getListingDetails(+req.params.id, req.currentUser);
  res.status(200).json({ listing });
});

/**
 * @openapi
 * /api/listings/{id}:
 *   patch:
 *     tags: [Listings]
 *     summary: Update a listing and its car
 *     description: A draft stays a draft. Any other status goes back to pending approval, which clears approvedAt and rejectionReason.
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
 *             properties:
 *               title: { type: string, minLength: 1, description: "Surrounding spaces are removed before it is checked and stored, so a value of only spaces is refused." }
 *               description: { type: string, minLength: 1, description: "Surrounding spaces are removed before it is checked and stored, so a value of only spaces is refused." }
 *               car:
 *                 type: object
 *                 properties:
 *                   makeId: { type: integer }
 *                   modelId: { type: integer }
 *                   carburantId: { type: integer }
 *                   originId: { type: integer }
 *                   stateId: { type: integer }
 *                   price: { type: number }
 *                   year: { type: integer }
 *                   ownersCount: { type: integer }
 *                   cityId: { type: integer }
 *                   distance: { type: string }
 *                   transmission: { type: string, enum: [manual, automatic] }
 *                   fiscalPower: { type: integer }
 *                   doorsNumber: { type: integer }
 *                   equipmentIds:
 *                     type: array
 *                     description: Replaces the car's whole equipment set with these ids from GET /api/equipment. Send an empty array to clear it; omit it to keep the current set. Unique, at most 100.
 *                     maxItems: 100
 *                     uniqueItems: true
 *                     items: { type: integer }
 *     responses:
 *       200:
 *         description: Listing updated
 *       400:
 *         description: Validation error or no car attached
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller
 */
// Update a listing; anything but a draft goes back for approval
listingRouter.patch(
  "/:id",
  isAuthenticated,
  isSeller,
  async (req: Request, res: Response) => {
    const paramValidation = attachListingParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const bodyValidation = updateListingSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      throw new RequestValidationError(bodyValidation.error.errors);
    }
    const listing = await updateListing(
      paramValidation.data.id,
      req.currentUser?.id!,
      bodyValidation.data,
    );
    res.status(200).json({ listing });
  },
);

/**
 * @openapi
 * /api/listings/{id}/approve:
 *   patch:
 *     tags: [Listings]
 *     summary: Approve a pending listing
 *     description: Requires an attached car and at least 3 uploaded images. Errors use the codes `listing.already_approved`, `listing.not_pending`, `listing.car_required` and `media.min_images`.
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
 *       400:
 *         description: Not pending, no car attached, or too few uploaded images
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Listing not found
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
 * /api/listings/{id}/reject:
 *   patch:
 *     tags: [Listings]
 *     summary: Reject a pending listing with a reason for the seller
 *     description: >
 *       The seller sees `rejectionReason` on /api/listings/mine and on the
 *       listing. Editing the listing sends it back to pending and clears it.
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 1, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Listing rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listing:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     status: { type: string, example: rejected }
 *                     rejectionReason: { type: string }
 *       400:
 *         description: Validation error, or the listing is not pending
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Listing not found
 */
listingRouter.patch(
  "/:id/reject",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    const paramValidation = attachListingParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      throw new RequestValidationError(paramValidation.error.errors);
    }
    const bodyValidation = rejectListingSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      throw new RequestValidationError(bodyValidation.error.errors);
    }

    const listing = await rejectListing(
      paramValidation.data.id,
      bodyValidation.data.reason,
    );
    res.status(200).json({ listing });
  },
);

/**
 * @openapi
 * /api/listings/{id}:
 *   delete:
 *     tags: [Listings]
 *     summary: Delete a listing, in any status, with or without a car
 *     description: Deletes the listing and, when it has one, its car and the car's media, then removes the stored files, including files not uploaded yet. A storage failure is only logged, so the listing stays deleted and the response is still 200.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean, example: true }
 *                 listingId: { type: integer }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a seller
 *       404:
 *         description: Listing not found for this seller
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

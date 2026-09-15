import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isMechanic } from "../../middlewares/is_mechanic";
import currentUser from "../../middlewares/current_user";
import {
  addGarageImagesSchema,
  createMechanicSchema,
  garageImageIdParamSchema,
  mechanicIdParamSchema,
  updateMechanicSchema,
  updateStatusSchema,
} from "./request_schema";
import {
  addGarageImages,
  createMechanicProfile,
  getMechanicById,
  getOwnMechanicProfile,
  removeGarageImage,
  updateMechanicProfile,
  updateMechanicStatus,
} from "./services";

const mechanicsRouter = Router();

/**
 * @openapi
 * /api/mechanics:
 *   post:
 *     tags: [Mechanics]
 *     summary: Create the current user's mechanic profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, cityId, address, latitude, longitude]
 *             properties:
 *               name: { type: string }
 *               cityId: { type: integer }
 *               address: { type: string }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               description: { type: string }
 *               phone: { type: string }
 *               inspectionPrice: { type: integer, minimum: 0 }
 *               profileImageFilename: { type: string }
 *     responses:
 *       201:
 *         description: Mechanic profile created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicsRouter.post("/", isAuthenticated, isMechanic, async (req, res) => {
  const validationResult = createMechanicSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await createMechanicProfile(
    req.currentUser!.id,
    validationResult.data,
  );
  res.status(201).json(result);
});

/**
 * @openapi
 * /api/mechanics/me:
 *   get:
 *     tags: [Mechanics]
 *     summary: Get the current user's mechanic profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mechanic profile
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicsRouter.get("/me", isAuthenticated, isMechanic, async (req, res) => {
  const mechanic = await getOwnMechanicProfile(req.currentUser!.id);
  res.status(200).json({ mechanic });
});

/**
 * @openapi
 * /api/mechanics/me:
 *   patch:
 *     tags: [Mechanics]
 *     summary: Update the current user's mechanic profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               cityId: { type: integer }
 *               address: { type: string }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               description: { type: string }
 *               phone: { type: string }
 *               inspectionPrice: { type: integer, minimum: 0 }
 *               profileImageFilename: { type: string }
 *     responses:
 *       200:
 *         description: Mechanic profile updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicsRouter.patch("/me", isAuthenticated, isMechanic, async (req, res) => {
  const validationResult = updateMechanicSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await updateMechanicProfile(
    req.currentUser!.id,
    validationResult.data,
  );
  res.status(200).json(result);
});

/**
 * @openapi
 * /api/mechanics/me/status:
 *   patch:
 *     tags: [Mechanics]
 *     summary: Update the current mechanic's active status
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicsRouter.patch(
  "/me/status",
  isAuthenticated,
  isMechanic,
  async (req, res) => {
    const validationResult = updateStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }

    const mechanic = await updateMechanicStatus(
      req.currentUser!.id,
      validationResult.data.isActive,
    );
    res.status(200).json({ mechanic });
  },
);

/**
 * @openapi
 * /api/mechanics/me/garage-images:
 *   post:
 *     tags: [Mechanics]
 *     summary: Add garage images to the current mechanic's profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filenames]
 *             properties:
 *               filenames:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       201:
 *         description: Garage images added
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicsRouter.post(
  "/me/garage-images",
  isAuthenticated,
  isMechanic,
  async (req, res) => {
    const validationResult = addGarageImagesSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }

    const result = await addGarageImages(
      req.currentUser!.id,
      validationResult.data,
    );
    res.status(201).json(result);
  },
);

/**
 * @openapi
 * /api/mechanics/me/garage-images/{imageId}:
 *   delete:
 *     tags: [Mechanics]
 *     summary: Remove a garage image from the current mechanic's profile
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Garage image removed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 */
mechanicsRouter.delete(
  "/me/garage-images/:imageId",
  isAuthenticated,
  isMechanic,
  async (req, res) => {
    const validationResult = garageImageIdParamSchema.safeParse(req.params);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }

    const result = await removeGarageImage(
      req.currentUser!.id,
      validationResult.data.imageId,
    );
    res.status(200).json(result);
  },
);

/**
 * @openapi
 * /api/mechanics/{id}:
 *   get:
 *     tags: [Mechanics]
 *     summary: Get a mechanic's public profile by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Mechanic profile
 *       400:
 *         description: Validation error
 *       404:
 *         description: Mechanic not found
 */
mechanicsRouter.get("/:id", currentUser, async (req, res) => {
  const validationResult = mechanicIdParamSchema.safeParse(req.params);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const mechanic = await getMechanicById(
    validationResult.data.id,
    req.currentUser?.id,
  );
  res.status(200).json({ mechanic });
});

export default mechanicsRouter;

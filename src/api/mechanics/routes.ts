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
} from "./request_schema";
import {
  addGarageImages,
  createMechanicProfile,
  getMechanicById,
  getOwnMechanicProfile,
  removeGarageImage,
  updateMechanicProfile,
} from "./services";

const mechanicsRouter = Router();

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

mechanicsRouter.get("/me", isAuthenticated, isMechanic, async (req, res) => {
  const mechanic = await getOwnMechanicProfile(req.currentUser!.id);
  res.status(200).json({ mechanic });
});

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

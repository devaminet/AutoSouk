import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isMechanic } from "../../middlewares/is_mechanic";
import { createMechanicSchema, updateMechanicSchema } from "./request_schema";
import {
  createMechanicProfile,
  getOwnMechanicProfile,
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

export default mechanicsRouter;

import { Router } from "express";
import { getModels } from "./services";
import { getCarModelsParamsSchema } from "./request_schema";
import { RequestValidationError } from "../../errors/request_validation_error";

const carModelRouter = Router();

carModelRouter.get("/:make_id", async (req, res) => {
  const validationResult = getCarModelsParamsSchema.safeParse(req.params);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const models = await getModels(validationResult.data.make_id);
  res.status(200).json({ models });
});

export default carModelRouter;

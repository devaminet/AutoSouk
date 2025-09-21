import { Router } from "express";
import isAuthenticated from "../../middlewares/is-authenticated";
import { createCarSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";

const carsRouter = Router();

carsRouter.post("/", isAuthenticated, async (req, res, next) => {
  const validationResult = createCarSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const requestData = validationResult.data;
});

export default carsRouter;

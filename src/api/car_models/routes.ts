import { Router } from "express";
import { getModels } from "./services";
import { getCarModelsParamsSchema } from "./request_schema";
import { RequestValidationError } from "../../errors/request_validation_error";

const carModelRouter = Router();

/**
 * @openapi
 * /api/models/{make_id}:
 *   get:
 *     tags: [Car Models]
 *     summary: List car models for a make
 *     parameters:
 *       - in: path
 *         name: make_id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: List of car models
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *       400:
 *         description: Validation error
 */
carModelRouter.get("/:make_id", async (req, res) => {
  const validationResult = getCarModelsParamsSchema.safeParse(req.params);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const models = await getModels(validationResult.data.make_id);
  res.status(200).json({ models });
});

export default carModelRouter;

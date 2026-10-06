import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isBuyer } from "../../middlewares/is_buyer";
import { isMechanic } from "../../middlewares/is_mechanic";
import {
  completeInspectionSchema,
  createInspectionSchema,
  inspectionIdParamSchema,
  updateInspectionStatusSchema,
} from "./request_schema";
import {
  getInspectionById,
  getMyInspections,
  requestInspection,
  submitInspectionReport,
  updateInspectionStatus,
} from "./services";

const inspectionsRouter = Router();

/**
 * @openapi
 * /api/inspections:
 *   post:
 *     tags: [Inspections]
 *     summary: Request an inspection from a mechanic for a car
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [carId, mechanicId]
 *             properties:
 *               carId: { type: integer }
 *               mechanicId: { type: integer }
 *     responses:
 *       201:
 *         description: Inspection requested
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a buyer
 *       404:
 *         description: Car or mechanic not found
 */
inspectionsRouter.post("/", isAuthenticated, isBuyer, async (req, res) => {
  const validationResult = createInspectionSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const result = await requestInspection(
    req.currentUser!.id,
    validationResult.data,
  );
  res.status(201).json(result);
});

/**
 * @openapi
 * /api/inspections:
 *   get:
 *     tags: [Inspections]
 *     summary: List the current user's inspections (buyer's requests or mechanic's queue)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inspections
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role has no inspections collection
 */
inspectionsRouter.get("/", isAuthenticated, async (req, res) => {
  const inspections = await getMyInspections(req.currentUser!);
  res.status(200).json({ inspections });
});

/**
 * @openapi
 * /api/inspections/{id}:
 *   get:
 *     tags: [Inspections]
 *     summary: Get an inspection by id (buyer or assigned mechanic only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Inspection
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view this inspection
 *       404:
 *         description: Inspection not found
 */
inspectionsRouter.get("/:id", isAuthenticated, async (req, res) => {
  const validationResult = inspectionIdParamSchema.safeParse(req.params);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }

  const inspection = await getInspectionById(
    validationResult.data.id,
    req.currentUser!.id,
  );
  res.status(200).json({ inspection });
});

/**
 * @openapi
 * /api/inspections/{id}:
 *   patch:
 *     tags: [Inspections]
 *     summary: Transition an inspection's status (buyer cancels; mechanic accepts, rejects, or starts)
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [accepted, rejected, in_progress, cancelled]
 *     responses:
 *       200:
 *         description: Inspection status updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Role cannot perform this transition
 *       404:
 *         description: Inspection not found
 */
inspectionsRouter.patch("/:id", isAuthenticated, async (req, res) => {
  const paramsResult = inspectionIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    throw new RequestValidationError(paramsResult.error.errors);
  }

  const bodyResult = updateInspectionStatusSchema.safeParse(req.body);
  if (!bodyResult.success) {
    throw new RequestValidationError(bodyResult.error.errors);
  }

  const result = await updateInspectionStatus(
    req.currentUser!,
    paramsResult.data.id,
    bodyResult.data,
  );
  res.status(200).json(result);
});

/**
 * @openapi
 * /api/inspections/{id}/report:
 *   post:
 *     tags: [Inspections]
 *     summary: Submit inspection findings and generate the PDF report
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
 *             required: [matricule, mileage, mileageConsistency, controleTechniqueValid, vignetteValid, verdict, overallScore, summary, sections]
 *             properties:
 *               matricule: { type: string }
 *               vin: { type: string, minLength: 17, maxLength: 17 }
 *               carteGriseNumber: { type: string }
 *               mileage: { type: integer, minimum: 0 }
 *               mileageConsistency: { type: string, enum: [consistent, suspicious, unverifiable] }
 *               mileageConsistencyNote: { type: string }
 *               firstRegistrationDate: { type: string, format: date }
 *               inspectedAt: { type: string, format: date-time }
 *               controleTechniqueValid: { type: boolean }
 *               controleTechniqueExpiry: { type: string, format: date }
 *               vignetteValid: { type: boolean }
 *               verdict: { type: string, enum: [excellent, good, fair, poor] }
 *               overallScore: { type: integer, minimum: 0, maximum: 100 }
 *               summary: { type: string }
 *               sections:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     category: { type: string }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           label: { type: string }
 *                           status: { type: string, enum: [pass, attention, fail] }
 *                           note: { type: string }
 *               estimatedRepairCost: { type: integer }
 *               photoFilenames:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Inspection completed and report generated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a mechanic
 *       404:
 *         description: Inspection not found
 */
inspectionsRouter.post(
  "/:id/report",
  isAuthenticated,
  isMechanic,
  async (req, res) => {
    const paramsResult = inspectionIdParamSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new RequestValidationError(paramsResult.error.errors);
    }

    const bodyResult = completeInspectionSchema.safeParse(req.body);
    if (!bodyResult.success) {
      throw new RequestValidationError(bodyResult.error.errors);
    }

    const result = await submitInspectionReport(
      req.currentUser!.id,
      paramsResult.data.id,
      bodyResult.data,
    );
    res.status(200).json(result);
  },
);

export default inspectionsRouter;

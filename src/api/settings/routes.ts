import { Request, Response, Router } from "express";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isAdmin } from "../../middlewares/is_admin";
import { RequestValidationError } from "../../errors/request_validation_error";
import { getPublicSettings } from "../../settings/store";
import { settingKeyParamSchema, updateSettingsSchema } from "./request_schema";
import { listSettings, resetSetting, updateSettings } from "./services";

const settingsRouter = Router();

/**
 * @openapi
 * /api/settings/public:
 *   get:
 *     tags: [Settings]
 *     summary: Get client-facing settings (upload limits, allowed file types, car bounds)
 *     description: Values the frontend should use for client-side checks. The backend enforces the same values.
 *     responses:
 *       200:
 *         description: Public settings keyed by setting name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 settings:
 *                   type: object
 *                   additionalProperties: true
 *                   example:
 *                     uploads.carImage.maxSizeBytes: 10485760
 *                     uploads.allowedImageExtensions: [jpg, jpeg, png, webp]
 */
settingsRouter.get("/public", (req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=60");
  res.status(200).json({ settings: getPublicSettings() });
});

/**
 * @openapi
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: List all settings with defaults and override metadata
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Every setting with value, defaultValue, isDefault, isPublic, description, updatedBy, updatedAt
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
settingsRouter.get(
  "/",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    res.status(200).json({ settings: await listSettings() });
  },
);

/**
 * @openapi
 * /api/settings:
 *   patch:
 *     tags: [Settings]
 *     summary: Override one or more settings
 *     description: All values are validated, including rules across settings, before anything is saved. Changes apply immediately on this instance and within the refresh interval on others.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [values]
 *             properties:
 *               values:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   uploads.carVideo.maxSizeBytes: 104857600
 *                   listings.car.maxDoors: 5
 *     responses:
 *       200:
 *         description: Updated list of all settings
 *       400:
 *         description: Unknown setting, invalid value, or broken rule (field is the setting key)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
settingsRouter.patch(
  "/",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    const validation = updateSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      throw new RequestValidationError(validation.error.errors);
    }
    const settings = await updateSettings(
      validation.data.values,
      req.currentUser?.id!,
    );
    res.status(200).json({ settings });
  },
);

/**
 * @openapi
 * /api/settings/{key}:
 *   delete:
 *     tags: [Settings]
 *     summary: Reset a setting to its default value
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated list of all settings
 *       400:
 *         description: Resetting would break a rule across settings
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Unknown setting
 */
settingsRouter.delete(
  "/:key",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    const validation = settingKeyParamSchema.safeParse(req.params);
    if (!validation.success) {
      throw new RequestValidationError(validation.error.errors);
    }
    const settings = await resetSetting(validation.data.key);
    res.status(200).json({ settings });
  },
);

export default settingsRouter;

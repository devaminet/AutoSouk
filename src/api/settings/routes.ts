import { Request, Response, Router } from "express";
import isAuthenticated from "../../middlewares/is_authenticated";
import { isAdmin } from "../../middlewares/is_admin";
import { RequestValidationError } from "../../errors/request_validation_error";
import {
  ifMatchHeaderSchema,
  settingKeyParamSchema,
  updateSettingsSchema,
} from "./request_schema";
import {
  getPublicSettingsPayload,
  listSettings,
  republishSettings,
  resetSetting,
  updateSettings,
} from "./services";

const settingsRouter = Router();

const toEntityTag = (version: number) => `"${version}"`;

const parseIfMatch = (req: Request) => {
  const validation = ifMatchHeaderSchema.safeParse(req.get("If-Match"));
  if (!validation.success) {
    throw new RequestValidationError(
      validation.error.errors.map((issue) => ({
        ...issue,
        path: ["if-match"],
      })),
    );
  }
  return validation.data;
};

const sendSettings = (
  res: Response,
  { version, settings }: Awaited<ReturnType<typeof listSettings>>,
) => {
  res.set("ETag", toEntityTag(version));
  res.status(200).json({ settings });
};

/**
 * @openapi
 * /api/settings/public:
 *   get:
 *     tags: [Settings]
 *     summary: Get client-facing settings (upload limits, allowed file types, car bounds)
 *     description: Values the frontend should use for client-side checks. The backend enforces the same values. Responses carry an ETag and Cache-Control no-cache; send the ETag back as If-None-Match to get a 304 when nothing changed.
 *     parameters:
 *       - in: header
 *         name: If-None-Match
 *         required: false
 *         description: ETag from a previous response
 *         schema: { type: string }
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
 *         headers:
 *           ETag:
 *             description: Hash of the public settings content
 *             schema: { type: string }
 *       304:
 *         description: Public settings unchanged since the ETag sent in If-None-Match
 */
settingsRouter.get("/public", (req: Request, res: Response) => {
  const { settings, entityTag } = getPublicSettingsPayload();
  // Cacheable anywhere, but revalidated on every use: a 304 is cheap and
  // clients never validate uploads against outdated limits.
  res.set("Cache-Control", "public, no-cache");
  res.set("ETag", entityTag);
  // Express answers 304 itself when If-None-Match matches the ETag.
  res.status(200).json({ settings });
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
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/SettingsETag'
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
    sendSettings(res, await listSettings());
  },
);

/**
 * @openapi
 * /api/settings:
 *   patch:
 *     tags: [Settings]
 *     summary: Override one or more settings
 *     description: All values are validated, including rules across settings, before anything is saved. Concurrent updates are applied one at a time. Changes apply immediately on every instance. Send the ETag from GET /api/settings as If-Match to avoid overwriting someone else's change.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/SettingsIfMatch'
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
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/SettingsETag'
 *       400:
 *         description: Unknown setting, invalid value, broken rule (field is the setting key), or malformed If-Match (field is if-match)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       412:
 *         description: If-Match does not match the current settings version
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
    const precondition = parseIfMatch(req);
    const result = await updateSettings(
      validation.data.values,
      req.currentUser?.id!,
      precondition,
    );
    sendSettings(res, result);
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
 *       - $ref: '#/components/parameters/SettingsIfMatch'
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated list of all settings
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/SettingsETag'
 *       400:
 *         description: Resetting would break a rule across settings, or malformed If-Match
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Unknown setting
 *       412:
 *         description: If-Match does not match the current settings version
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
    const precondition = parseIfMatch(req);
    sendSettings(res, await resetSetting(validation.data.key, precondition));
  },
);

/**
 * @openapi
 * /api/settings/republish:
 *   post:
 *     tags: [Settings]
 *     summary: Push the settings stored in Postgres to Redis and every instance
 *     description: Repair tool for cases normal sync can't fix, such as a database restored to an older settings version. Bumps the settings version above the copy in Redis, then publishes. Instances already resync on their own after a Redis outage or data loss.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Published. Body is the list of all settings.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/SettingsETag'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       503:
 *         description: Redis is unreachable, nothing was published
 */
settingsRouter.post(
  "/republish",
  isAuthenticated,
  isAdmin,
  async (req: Request, res: Response) => {
    sendSettings(res, await republishSettings());
  },
);

/**
 * @openapi
 * components:
 *   headers:
 *     SettingsETag:
 *       description: Current settings version as a strong entity tag
 *       schema: { type: string, example: '"7"' }
 *   parameters:
 *     SettingsIfMatch:
 *       in: header
 *       name: If-Match
 *       required: false
 *       description: ETag from GET /api/settings. The write is refused with 412 if settings changed since. "*" or no header skips the check.
 *       schema: { type: string, example: '"7"' }
 */

export default settingsRouter;

import { Router } from "express";
import { RequestValidationError } from "../../errors/request_validation_error";
import { catalogParamsSchema } from "./request_schema";
import { getCatalog } from "./services";

const i18nRouter = Router();

// Catalogs only change with a deploy; the ETag lets clients revalidate cheaply.
const catalogCacheControl = "public, max-age=3600";

/**
 * @openapi
 * /api/i18n/{locale}/{namespace}:
 *   get:
 *     tags: [I18n]
 *     summary: Get a translation catalog
 *     description: >
 *       Returns one i18next resource namespace for a locale, in i18next JSON
 *       format (`{{placeholder}}` interpolation, `_one`/`_other`… plural
 *       suffixes), ready for i18next-http-backend. `errors` and `messages`
 *       translate the `code` of error and success responses with their
 *       `params`; `enums` translates lookup values and statuses by slug, for
 *       example `carburant.diesel`, `listing_status.pending`,
 *       `equipment.panoramic_roof` or `city.casablanca`.
 *     parameters:
 *       - in: path
 *         name: locale
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, fr, ar]
 *       - in: path
 *         name: namespace
 *         required: true
 *         schema:
 *           type: string
 *           enum: [errors, messages, enums]
 *     responses:
 *       200:
 *         description: The catalog, as nested keys and messages
 *         headers:
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: public, max-age=3600
 *           ETag:
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *             example:
 *               carburant: { diesel: Diesel, petrol: Essence }
 *       304:
 *         description: The catalog matches the If-None-Match ETag
 *       400:
 *         description: Unsupported locale or namespace
 */
i18nRouter.get("/:locale/:namespace", (req, res) => {
  const validationResult = catalogParamsSchema.safeParse(req.params);
  if (!validationResult.success) {
    throw new RequestValidationError(validationResult.error.errors);
  }
  const { locale, namespace } = validationResult.data;

  res.set("Cache-Control", catalogCacheControl);
  res.status(200).json(getCatalog(locale, namespace));
});

export default i18nRouter;

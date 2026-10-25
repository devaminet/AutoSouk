import { Router } from "express";
import { getEquipmentCatalog } from "./services";

const equipmentRouter = Router();

// The catalog only changes with a deploy that re-runs the seed.
const catalogCacheControl = "public, max-age=3600";

/**
 * @openapi
 * /api/equipment:
 *   get:
 *     tags: [Equipment]
 *     summary: List the car equipment catalog grouped by category
 *     description: >
 *       Categories and their equipment are returned in display order. Use
 *       `slug` as the translation key; `name` is the English fallback. Send the
 *       equipment `id` values as `equipmentIds` when attaching or updating a car.
 *     responses:
 *       200:
 *         description: Equipment catalog
 *         headers:
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: public, max-age=3600
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       slug: { type: string, example: comfort }
 *                       name: { type: string, example: Comfort }
 *                       equipment:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id: { type: integer }
 *                             slug: { type: string, example: panoramic_roof }
 *                             name: { type: string, example: Panoramic roof }
 */
equipmentRouter.get("/", async (req, res) => {
  const categories = await getEquipmentCatalog();
  res.set("Cache-Control", catalogCacheControl);
  res.status(200).json({ categories });
});

export default equipmentRouter;

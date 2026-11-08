import { Router } from "express";
import { getLookups } from "./services";

const lookupsRouter = Router();

// Lookup values only change with a deploy that re-runs the seeds.
const lookupsCacheControl = "public, max-age=3600";

/**
 * @openapi
 * /api/lookups:
 *   get:
 *     tags: [Lookups]
 *     summary: List the cities, fuels, car states and car origins
 *     description: >
 *       The options of the signup, car and filter forms. Send `id` to the API
 *       (`cityId`, `carburantId`, `stateId`, `originId`) and translate `slug`
 *       with the `enums` catalog (`city.<slug>`, `carburant.<slug>`,
 *       `car_state.<slug>`, `car_origin.<slug>`). City `name` is the fallback
 *       for a city without a label.
 *     responses:
 *       200:
 *         description: Lookup values
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
 *                 cities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       slug: { type: string, example: casablanca }
 *                       name: { type: string, example: Casablanca }
 *                       latitude: { type: number, nullable: true, example: 33.5731, description: "The city's centre" }
 *                       longitude: { type: number, nullable: true, example: -7.5898 }
 *                       radiusKm: { type: number, nullable: true, example: 20, description: "How far the city reaches from its centre. A workshop's pin must be within it." }
 *                 carburants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       slug: { type: string, example: diesel }
 *                 states:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       slug: { type: string, example: very_good }
 *                 origins:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       slug: { type: string, example: imported_new }
 */
lookupsRouter.get("/", async (req, res) => {
  const lookups = await getLookups();
  res.set("Cache-Control", lookupsCacheControl);
  res.status(200).json(lookups);
});

export default lookupsRouter;

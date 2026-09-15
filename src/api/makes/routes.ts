import { Router } from "express";
import { getMakes } from "./services";

const makeRouter = Router();

/**
 * @openapi
 * /api/makes:
 *   get:
 *     tags: [Makes]
 *     summary: List car makes
 *     responses:
 *       200:
 *         description: List of car makes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 makes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 */
makeRouter.get("/", async (req, res) => {
  const makes = await getMakes();
  res.status(200).json({ makes });
});

export default makeRouter;

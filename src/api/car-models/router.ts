import { Router } from "express";
import { getModels } from "./services";

const carModelRouter = Router();

carModelRouter.get("/:make_id", async (req, res) => {
  const makeId = Number(req.params.make_id);
  const models = await getModels(makeId);
  res.status(200).json({ models });
});

export default carModelRouter;

import { Router } from "express";
import { getMakes } from "./services";

const makeRouter = Router();

makeRouter.get("/", async (req, res) => {
  const makes = await getMakes();
  res.status(200).json({ makes });
});

export default makeRouter;

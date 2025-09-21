import { Router, Request, Response } from "express";
import { createListingSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import { db } from "../../db";
import { listingTable } from "../../db/schema/listing";
import isAuthenticated from "../../middlewares/is-authenticated";

const listingRouter = Router();

listingRouter.post(
  "/",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const validationResult = createListingSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new RequestValidationError(validationResult.error.errors);
    }
    const { title, description } = validationResult.data;
    const result = await db
      .insert(listingTable)
      .values({
        title,
        description,
        status: "draft",
        userId: req.currentUser?.id,
      })
      .returning();
    res.status(201).json({ listing: result });
  }
);

export default listingRouter;

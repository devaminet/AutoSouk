import { Router, Request, Response } from "express";
import { createListingSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import { db } from "../../db";
import { listingTable } from "../../db/schema/listing";
import isAuthenticated from "../../middlewares/is-authenticated";
import { createCarSchema } from "../cars/request-schema";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "../../errors/not-found-error";
import { carTable } from "../../db/schema/car";
import { carMediaTable } from "../../db/schema/car_media";
import { getFileType } from "../../utils/functions";

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

listingRouter.post(
  "/:id/cars",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const validateResult = createCarSchema.safeParse(req.body);
    if (!validateResult.success) {
      throw new RequestValidationError(validateResult.error.errors);
    }
    const listingId = +req.params.id;
    const listing = await db
      .select({ id: listingTable.id, userId: listingTable.userId })
      .from(listingTable)
      .where(
        and(
          eq(listingTable.id, listingId),
          eq(listingTable.userId, req.currentUser?.id!)
        )
      );

    if (listing.length === 0) {
      throw new NotFoundError("Listing was not found");
    }

    const { filenames, ...carDetails } = validateResult.data;

    const car = await db.transaction(async (tx) => {
      const car = await tx
        .insert(carTable)
        .values({
          ...carDetails,
          listingId,
          userId: req.currentUser?.id,
        })
        .returning();

      const carMediaValues = filenames.map((filename) => ({
        carId: car[0].id,
        link: filename,
        type: getFileType(filename) as "image" | "video",
      }));

      await tx.insert(carMediaTable).values(carMediaValues);
      return { ...car[0], filenames };
    });

    res.status(201).json({ car });
  }
);

export default listingRouter;

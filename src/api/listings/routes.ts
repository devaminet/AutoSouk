import { Router, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { createListingSchema } from "./request-schema";
import { RequestValidationError } from "../../errors/request-validation-error";
import { db } from "../../db";
import { listingTable } from "../../db/schema/listing";
import isAuthenticated from "../../middlewares/is-authenticated";
import { createCarSchema } from "../cars/request-schema";
import { NotFoundError } from "../../errors/not-found-error";
import { carTable } from "../../db/schema/car";
import { carMediaTable } from "../../db/schema/car_media";
import { generatePresignedUrls, getFileType } from "../../utils/functions";
import { carBucketName } from "../../utils/constants";

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
    const urlsMap = await generatePresignedUrls(carBucketName, filenames);

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
      return { ...car[0], filenames, urls: Object.fromEntries(urlsMap) };
    });

    res.status(201).json({ car });
  }
);

listingRouter.get(
  "/:id",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const listing = await db.query.listingTable.findFirst({
      where: eq(listingTable.id, +req.params.id),
      columns: {
        createdAt: false,
        updatedAt: false,
        userId: false,
      },
      with: {
        user: {
          columns: {
            firstName: true,
            lastName: true,
            city: true,
            imageUrl: true,
            isVerified: true,
          },
        },
        car: {
          columns: {
            id: true,
            price: true,
            city: true,
            year: true,
            distance: true,
            doorsNumber: true,
            fiscalPower: true,
            transmission: true,
            ownersCount: true,
          },
          with: {
            carburant: {
              columns: {
                carburant: true,
              },
            },
            carMedias: {
              columns: {
                link: true,
                type: true,
              },
            },
            make: {
              columns: {
                name: true,
              },
            },
            model: {
              columns: {
                name: true,
              },
            },
            origin: {
              columns: {
                origin: true,
              },
            },
            state: {
              columns: {
                state: true,
              },
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundError("Listing was not found!");
    }

    const carMedias = listing.car?.carMedias;
    if (carMedias) {
      const filenames = carMedias.map((media) => media.link);
      const urlsMap = await generatePresignedUrls(carBucketName, filenames);
      for (const media of carMedias) {
        media.link = urlsMap.get(media.link) || "";
      }
    }

    res.status(200).json({ listing });
  }
);

export default listingRouter;

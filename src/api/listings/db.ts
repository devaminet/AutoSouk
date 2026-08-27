import { z } from "zod";
import { getListingsQuerySchema } from "./request_schema";
import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { listingTable } from "../../db/schema/listing";
import { carTable } from "../../db/schema/car";
import { db } from "../../db";

export const findListings = async (
  options: z.infer<typeof getListingsQuerySchema>,
) => {
  const { page, limit, makeId, modelId, city, minPrice, maxPrice, sort } =
    options;

  const conditions = [eq(listingTable.status, "approved")];

  if (makeId) conditions.push(eq(carTable.makeId, makeId));
  if (modelId) conditions.push(eq(carTable.modelId, modelId));
  if (city) conditions.push(ilike(carTable.city, `%${city}%`));
  if (minPrice !== undefined) conditions.push(gte(carTable.price, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(carTable.price, maxPrice));

  let orderByClause;
  if (sort === "price_asc") {
    orderByClause = asc(carTable.price);
  } else if (sort === "price_desc") {
    orderByClause = desc(carTable.price);
  } else if (sort === "oldest") {
    orderByClause = asc(listingTable.createdAt);
  } else {
    orderByClause = desc(listingTable.createdAt);
  }

  const listings = await db.query.listingTable.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
    },
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          imageUrl: true,
          phone: true,
        },
      },
      car: {
        columns: {},
        with: {
          carMedias: {
            columns: {
              type: true,
              link: true,
              isPrimary: true,
            },
            orderBy(fields, operators) {
              return operators.desc(fields.isPrimary);
            },
          },
        },
      },
    },
    where: and(...conditions),
    orderBy: orderByClause,
    limit,
    offset: (page - 1) * limit,
  });

  const totalCountResult = await db
    .select({ count: count() })
    .from(listingTable)
    .innerJoin(carTable, eq(listingTable.id, carTable.listingId))
    .where(and(...conditions));

  return { listings, totalCountResult };
};

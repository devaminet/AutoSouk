import { eq } from "drizzle-orm";
import { db } from "../../db";
import { carModelTable } from "../../db/schema/car_model";

export const getModels = async (makeId: number) => {
  const models = await db
    .select({ id: carModelTable.id, name: carModelTable.name })
    .from(carModelTable)
    .where(eq(carModelTable.makeId, makeId));

  return models;
};

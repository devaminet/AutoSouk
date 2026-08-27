import { eq } from "drizzle-orm";
import { db } from "../../db";
import { carModelTable } from "../../db/schema/car_model";

export const findMakeModels = async (makeId: number) => {
  return await db
    .select({ id: carModelTable.id, name: carModelTable.name })
    .from(carModelTable)
    .where(eq(carModelTable.makeId, makeId));
};

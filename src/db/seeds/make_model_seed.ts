import { makeTable } from "../schema/car_make";
import { db } from "..";
import { carModelTable } from "../schema/car_model";
import { readSeedFile } from "../../utils/functions";

export const generateMakeAndModelData = async () => {
  const makes = await readSeedFile("makes");
  const models = await readSeedFile("models");
  await db.insert(makeTable).values(JSON.parse(makes)).onConflictDoNothing();
  await db
    .insert(carModelTable)
    .values(JSON.parse(models))
    .onConflictDoNothing();
};

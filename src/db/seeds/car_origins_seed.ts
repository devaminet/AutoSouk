import { db } from "..";
import { readSeedFile } from "../../utils/functions";
import { carOriginTable } from "../schema/car_origin";

export const generateCarOriginsData = async () => {
  const origins = await readSeedFile("car_origins");
  await db
    .insert(carOriginTable)
    .values(JSON.parse(origins))
    .onConflictDoNothing({
      target: carOriginTable.origin,
    });
};

import { db } from "..";
import { readSeedFile } from "../../utils/functions";
import { carCarburantTable } from "../schema/carburant";

export const generateCarCarburantData = async () => {
  const data = await readSeedFile("carburants");
  await db
    .insert(carCarburantTable)
    .values(JSON.parse(data))
    .onConflictDoNothing({
      target: carCarburantTable.carburant,
    });
};

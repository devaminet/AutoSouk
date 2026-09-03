import { db } from "..";
import { readSeedFile } from "../../utils/functions";
import { cityTable } from "../schema/city";

export const generateCitiesData = async () => {
  const data = await readSeedFile("cities");
  await db.insert(cityTable).values(JSON.parse(data)).onConflictDoNothing({
    target: cityTable.name,
  });
};

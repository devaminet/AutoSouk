import { db } from "..";
import { readSeedFile } from "../../utils/functions";
import { carStateTable } from "../schema/state";

export const generateCarStatesData = async () => {
  const data = await readSeedFile("car_states");
  await db.insert(carStateTable).values(JSON.parse(data)).onConflictDoNothing({
    target: carStateTable.state,
  });
};

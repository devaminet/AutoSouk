import { db } from "../../db";
import { makeTable } from "../../db/schema/car_make";

export const getMakes = async () => {
  const makes = await db
    .select({ id: makeTable.id, name: makeTable.name })
    .from(makeTable);

  return makes;
};

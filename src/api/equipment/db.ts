import { asc } from "drizzle-orm";
import { db } from "../../db";
import {
  equipmentCategoryTable,
  equipmentTable,
} from "../../db/schema/equipment";

export const findEquipmentCatalog = async () => {
  return await db.query.equipmentCategoryTable.findMany({
    columns: { id: true, slug: true, name: true },
    orderBy: [asc(equipmentCategoryTable.position)],
    with: {
      equipment: {
        columns: { id: true, slug: true, name: true },
        orderBy: [asc(equipmentTable.position)],
      },
    },
  });
};

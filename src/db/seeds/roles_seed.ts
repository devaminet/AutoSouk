import { db } from "..";
import { rolesTable } from "../schema/roles";

export const generateRolesData = async () => {
  await db
    .insert(rolesTable)
    .values([
      { name: "buyer" },
      { name: "seller" },
      { name: "mechanic" },
      { name: "admin" },
    ])
    .onConflictDoNothing({ target: rolesTable.name });
};

import { asc } from "drizzle-orm";
import { db } from "../..";
import { rolesTable } from "../../schema/roles";
import { generateRolesData } from "../roles_seed";

describe("roles seed", () => {
  it("inserts each default role once and preserves IDs on repeated runs", async () => {
    const initialRoles = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .orderBy(asc(rolesTable.name));

    await generateRolesData();
    await generateRolesData();

    const seededRoles = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .orderBy(asc(rolesTable.name));

    expect(seededRoles).toHaveLength(4);
    expect(seededRoles.map(({ name }) => name)).toEqual([
      "admin",
      "buyer",
      "mechanic",
      "seller",
    ]);
    expect(seededRoles).toEqual(initialRoles);
  });
});

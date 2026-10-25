import { asc, eq } from "drizzle-orm";
import { db } from "../..";
import { equipmentCategoryTable, equipmentTable } from "../../schema/equipment";
import { generateEquipmentData } from "../equipment_seed";

const selectCatalog = () =>
  db
    .select({
      id: equipmentTable.id,
      slug: equipmentTable.slug,
      name: equipmentTable.name,
      position: equipmentTable.position,
      category: equipmentCategoryTable.slug,
    })
    .from(equipmentTable)
    .innerJoin(
      equipmentCategoryTable,
      eq(equipmentTable.categoryId, equipmentCategoryTable.id),
    )
    .orderBy(
      asc(equipmentCategoryTable.position),
      asc(equipmentTable.position),
    );

describe("equipment seed", () => {
  it("seeds every category in display order", async () => {
    const categories = await db
      .select({ slug: equipmentCategoryTable.slug })
      .from(equipmentCategoryTable)
      .orderBy(asc(equipmentCategoryTable.position));

    expect(categories.map(({ slug }) => slug)).toEqual([
      "safety",
      "driving_assistance",
      "comfort",
      "multimedia",
      "exterior",
    ]);
  });

  it("seeds equipment under its category", async () => {
    const catalog = await selectCatalog();

    expect(catalog).toHaveLength(72);
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "abs", category: "safety" }),
        expect.objectContaining({
          slug: "cruise_control",
          category: "driving_assistance",
        }),
        expect.objectContaining({
          slug: "panoramic_roof",
          category: "comfort",
        }),
        expect.objectContaining({
          slug: "cd_dvd_player",
          category: "multimedia",
        }),
        expect.objectContaining({ slug: "alloy_wheels", category: "exterior" }),
      ]),
    );
  });

  it("keeps IDs and restores seeded labels on repeated runs", async () => {
    const initialCatalog = await selectCatalog();
    await db
      .update(equipmentTable)
      .set({ name: "Renamed" })
      .where(eq(equipmentTable.slug, "abs"));

    await generateEquipmentData();
    await generateEquipmentData();

    expect(await selectCatalog()).toEqual(initialCatalog);
  });
});

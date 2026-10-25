import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "..";
import { readSeedFile } from "../../utils/functions";
import { equipmentCategoryTable, equipmentTable } from "../schema/equipment";

const slugSchema = z.string().regex(/^[a-z0-9_]+$/);

const equipmentSeedSchema = z.array(
  z.object({
    slug: slugSchema,
    name: z.string().min(1),
    equipment: z
      .array(z.object({ slug: slugSchema, name: z.string().min(1) }))
      .min(1),
  }),
);

// The catalog is owned by the seed file: re-running it adds new entries and
// applies renamed labels, categories and display order to existing slugs.
export const generateEquipmentData = async () => {
  const categories = equipmentSeedSchema.parse(
    JSON.parse(await readSeedFile("equipment")),
  );

  await db.transaction(async (tx) => {
    const savedCategories = await tx
      .insert(equipmentCategoryTable)
      .values(
        categories.map(({ slug, name }, position) => ({
          slug,
          name,
          position,
        })),
      )
      .onConflictDoUpdate({
        target: equipmentCategoryTable.slug,
        set: {
          name: sql`excluded.name`,
          position: sql`excluded.position`,
        },
      })
      .returning({
        id: equipmentCategoryTable.id,
        slug: equipmentCategoryTable.slug,
      });

    const categoryIds = new Map(
      savedCategories.map(({ id, slug }) => [slug, id]),
    );
    const categoryIdOf = (slug: string) => {
      const id = categoryIds.get(slug);
      if (id === undefined) {
        throw new Error(`Equipment category ${slug} was not saved`);
      }
      return id;
    };

    await tx
      .insert(equipmentTable)
      .values(
        categories.flatMap(({ slug, equipment }) =>
          equipment.map((item, position) => ({
            ...item,
            position,
            categoryId: categoryIdOf(slug),
          })),
        ),
      )
      .onConflictDoUpdate({
        target: equipmentTable.slug,
        set: {
          name: sql`excluded.name`,
          position: sql`excluded.position`,
          categoryId: sql`excluded.category_id`,
        },
      });
  });
};

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "..";
import { readSeedFile } from "../../utils/functions";
import { cityTable } from "../schema/city";

const citiesSeedSchema = z.array(
  z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9_]+$/),
  }),
);

// Cities are matched by name; the slug is the translation key clients use
// (enums:city.<slug>), so re-running the seed fills or corrects it.
export const generateCitiesData = async () => {
  const cities = citiesSeedSchema.parse(
    JSON.parse(await readSeedFile("cities")),
  );
  await db
    .insert(cityTable)
    .values(cities)
    .onConflictDoUpdate({
      target: cityTable.name,
      set: { slug: sql`excluded.slug` },
    });
};

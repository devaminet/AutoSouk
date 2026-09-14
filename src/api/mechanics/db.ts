import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { mechanicGarageImageTable } from "../../db/schema/mechanic_garage_image";
import { mechanicTable } from "../../db/schema/mechanic";
import { createMechanicSchema, updateMechanicSchema } from "./request_schema";

type CreateMechanicData = z.infer<typeof createMechanicSchema>;
type UpdateMechanicData = z.infer<typeof updateMechanicSchema>;

const toUpdateMechanicValues = (data: UpdateMechanicData) => {
  const { profileImageFilename, ...mechanicValues } = data;

  return {
    ...mechanicValues,
    ...(profileImageFilename === undefined
      ? {}
      : { profileImageUrl: profileImageFilename }),
  };
};

export const findMechanicByUserId = async (userId: number) => {
  const mechanic = await db.query.mechanicTable.findFirst({
    where: eq(mechanicTable.userId, userId),
    with: {
      city: true,
      garageImages: true,
    },
  });

  return mechanic ?? null;
};

export const findMechanicById = async (mechanicId: number) => {
  const mechanic = await db.query.mechanicTable.findFirst({
    where: eq(mechanicTable.id, mechanicId),
    with: {
      city: true,
      garageImages: true,
    },
  });

  return mechanic ?? null;
};

export const findActiveMechanicsByCity = async (
  cityId: number,
  { page, limit }: { page: number; limit: number },
) => {
  const conditions = and(
    eq(mechanicTable.cityId, cityId),
    eq(mechanicTable.isActive, true),
  );
  const mechanics = await db.query.mechanicTable.findMany({
    where: conditions,
    with: {
      city: true,
      garageImages: true,
    },
    orderBy: asc(mechanicTable.id),
    limit,
    offset: (page - 1) * limit,
  });
  const totalCountResult = await db
    .select({ count: count() })
    .from(mechanicTable)
    .where(conditions);

  return { mechanics, totalCountResult };
};

export const insertMechanic = async (
  userId: number,
  data: CreateMechanicData,
) => {
  const { profileImageFilename, ...mechanicValues } = data;
  const [mechanic] = await db
    .insert(mechanicTable)
    .values({
      userId,
      ...mechanicValues,
      ...(profileImageFilename === undefined
        ? {}
        : { profileImageUrl: profileImageFilename }),
    })
    .returning();

  return mechanic;
};

export const updateMechanicByUserId = async (
  userId: number,
  data: UpdateMechanicData,
) => {
  const [mechanic] = await db
    .update(mechanicTable)
    .set(toUpdateMechanicValues(data))
    .where(eq(mechanicTable.userId, userId))
    .returning();

  return mechanic ?? null;
};

export const updateMechanicActiveStatus = async (
  mechanicId: number,
  isActive: boolean,
) => {
  await db
    .update(mechanicTable)
    .set({ isActive })
    .where(eq(mechanicTable.id, mechanicId));
};

export const insertMechanicGarageImage = async (
  mechanicId: number,
  link: string,
) => {
  const [garageImage] = await db
    .insert(mechanicGarageImageTable)
    .values({ mechanicId, link })
    .returning();

  return garageImage;
};

export const insertGarageImages = async (
  mechanicId: number,
  links: string[],
) => {
  if (links.length === 0) {
    return [];
  }

  return await db
    .insert(mechanicGarageImageTable)
    .values(links.map((link) => ({ mechanicId, link })))
    .returning();
};

export const deleteGarageImageByOwner = async (
  imageId: number,
  mechanicId: number,
) => {
  const [garageImage] = await db
    .delete(mechanicGarageImageTable)
    .where(
      and(
        eq(mechanicGarageImageTable.id, imageId),
        eq(mechanicGarageImageTable.mechanicId, mechanicId),
      ),
    )
    .returning();

  return garageImage ?? null;
};

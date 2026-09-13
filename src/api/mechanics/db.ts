import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
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

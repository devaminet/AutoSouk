import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import { mechanicsBucketName } from "../../utils/constants";
import { generatePresignedUrl } from "../../utils/functions";
import {
  findMechanicByUserId,
  insertMechanic,
  updateMechanicByUserId,
} from "./db";
import { createMechanicSchema, updateMechanicSchema } from "./request_schema";

type CreateMechanicData = z.infer<typeof createMechanicSchema>;
type UpdateMechanicData = z.infer<typeof updateMechanicSchema>;

const getProfileImageUploadUrl = async (filename?: string) => {
  if (!filename) {
    return undefined;
  }

  try {
    return await generatePresignedUrl(mechanicsBucketName, filename);
  } catch (error) {
    console.error("Error generating profile image upload URL:", error);
    throw new InternalServerError(
      `Could not generate URL for profile image: ${filename}`,
    );
  }
};

export const createMechanicProfile = async (
  userId: number,
  data: CreateMechanicData,
) => {
  const existingMechanic = await findMechanicByUserId(userId);
  if (existingMechanic) {
    throw new BadRequestError("A mechanic profile already exists");
  }

  await insertMechanic(userId, data);
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new InternalServerError(
      "Could not retrieve the created mechanic profile",
    );
  }

  const profileImageUploadUrl = await getProfileImageUploadUrl(
    data.profileImageFilename,
  );

  return { mechanic, profileImageUploadUrl };
};

export const getOwnMechanicProfile = async (userId: number) => {
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new NotFoundError("Mechanic profile was not found");
  }

  return mechanic;
};

export const updateMechanicProfile = async (
  userId: number,
  data: UpdateMechanicData,
) => {
  const mechanic = await updateMechanicByUserId(userId, data);
  if (!mechanic) {
    throw new NotFoundError("Mechanic profile was not found");
  }

  const profileImageUploadUrl = await getProfileImageUploadUrl(
    data.profileImageFilename,
  );

  return { mechanic, profileImageUploadUrl };
};

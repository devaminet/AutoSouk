import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import { mechanicsBucketName } from "../../utils/constants";
import {
  generateGetPresignedUrl,
  generateGetPresignedUrls,
  generatePresignedUrl,
  generatePresignedUrls,
} from "../../utils/functions";
import { findListingCityById } from "../listings/db";
import { getMechanicRatingSummary } from "../mechanic_reviews/services";
import {
  deleteGarageImageByOwner,
  findActiveMechanicsByCity,
  findMechanicById,
  findMechanicByUserId,
  insertGarageImages,
  insertMechanic,
  updateMechanicByUserId,
  updateMechanicStatusByUserId,
} from "./db";
import {
  addGarageImagesSchema,
  createMechanicSchema,
  listingMechanicsQuerySchema,
  updateMechanicSchema,
} from "./request_schema";

type CreateMechanicData = z.infer<typeof createMechanicSchema>;
type UpdateMechanicData = z.infer<typeof updateMechanicSchema>;
type ListingMechanicsQuery = z.infer<typeof listingMechanicsQuerySchema>;
type AddGarageImagesData = z.infer<typeof addGarageImagesSchema>;

const attachMechanicImageUrls = async <
  T extends {
    profileImageUrl: string | null;
    garageImages: { link: string }[];
  },
>(
  mechanic: T,
): Promise<T> => {
  try {
    if (mechanic.profileImageUrl) {
      mechanic.profileImageUrl = await generateGetPresignedUrl(
        mechanicsBucketName,
        mechanic.profileImageUrl,
      );
    }

    const filenames = mechanic.garageImages.map((image) => image.link);
    const urls = await generateGetPresignedUrls(mechanicsBucketName, filenames);
    for (const image of mechanic.garageImages) {
      image.link = urls.get(image.link) ?? "";
    }
  } catch (error) {
    console.error("Error generating mechanic image URLs:", error);
    throw new InternalServerError("mechanic.image_urls_failed");
  }

  return mechanic;
};

const attachRatingSummary = async <T extends { id: number }>(mechanic: T) => ({
  ...mechanic,
  rating: await getMechanicRatingSummary(mechanic.id),
});

const getProfileImageUploadUrl = async (filename?: string) => {
  if (!filename) {
    return undefined;
  }

  try {
    return await generatePresignedUrl(mechanicsBucketName, filename);
  } catch (error) {
    console.error(
      `Error generating profile image upload URL for ${filename}:`,
      error,
    );
    throw new InternalServerError("mechanic.profile_image_url_failed");
  }
};

export const createMechanicProfile = async (
  userId: number,
  data: CreateMechanicData,
) => {
  const existingMechanic = await findMechanicByUserId(userId);
  if (existingMechanic) {
    throw new BadRequestError("mechanic.already_exists");
  }

  await insertMechanic(userId, data);
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new InternalServerError("mechanic.profile_reload_failed");
  }

  const profileImageUploadUrl = await getProfileImageUploadUrl(
    data.profileImageFilename,
  );

  return { mechanic: await attachMechanicImageUrls(mechanic), profileImageUploadUrl };
};

export const getOwnMechanicProfile = async (userId: number) => {
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new NotFoundError("mechanic.profile_not_found");
  }

  return attachRatingSummary(await attachMechanicImageUrls(mechanic));
};

export const addGarageImages = async (
  userId: number,
  data: AddGarageImagesData,
) => {
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new NotFoundError("mechanic.profile_not_found");
  }

  let uploadUrls: Map<string, string>;
  try {
    uploadUrls = await generatePresignedUrls(
      mechanicsBucketName,
      data.filenames,
    );
  } catch (error) {
    console.error("Error generating garage image upload URLs:", error);
    throw new InternalServerError("mechanic.garage_upload_urls_failed");
  }

  if (data.filenames.some((filename) => !uploadUrls.has(filename))) {
    throw new InternalServerError("mechanic.garage_upload_urls_failed");
  }

  const garageImages = await insertGarageImages(mechanic.id, data.filenames);
  return {
    garageImages: garageImages.map((image) => ({
      id: image.id,
      filename: image.link,
      signedUrl: uploadUrls.get(image.link)!,
    })),
  };
};

export const removeGarageImage = async (userId: number, imageId: number) => {
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new NotFoundError("mechanic.profile_not_found");
  }

  const garageImage = await deleteGarageImageByOwner(imageId, mechanic.id);
  if (!garageImage) {
    throw new NotFoundError("mechanic.garage_image_not_found");
  }

  return { deleted: true, imageId: garageImage.id };
};

export const getMechanicById = async (
  mechanicId: number,
  requesterUserId?: number,
) => {
  const mechanic = await findMechanicById(mechanicId);
  const isOwner = mechanic?.userId === requesterUserId;
  if (!mechanic || (!mechanic.isActive && !isOwner)) {
    throw new NotFoundError("mechanic.profile_not_found");
  }

  return attachRatingSummary(await attachMechanicImageUrls(mechanic));
};

const emptyMechanicsResult = ({ page, limit }: ListingMechanicsQuery) => ({
  mechanics: [],
  meta: {
    total: 0,
    page,
    limit,
    totalPages: 0,
  },
});

export const getMechanicsForListing = async (
  listingId: number,
  query: ListingMechanicsQuery,
) => {
  const listing = await findListingCityById(listingId);
  const cityId = listing?.car?.cityId;
  if (listing?.status !== "approved" || !cityId) {
    return emptyMechanicsResult(query);
  }

  const { mechanics, totalCountResult } = await findActiveMechanicsByCity(
    cityId,
    query,
  );

  for (const mechanic of mechanics) {
    await attachMechanicImageUrls(mechanic);
  }

  const total = totalCountResult[0]?.count ?? 0;
  return {
    mechanics,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const updateMechanicProfile = async (
  userId: number,
  data: UpdateMechanicData,
) => {
  const updated = await updateMechanicByUserId(userId, data);
  if (!updated) {
    throw new NotFoundError("mechanic.profile_not_found");
  }
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new InternalServerError("mechanic.profile_reload_failed");
  }

  const profileImageUploadUrl = await getProfileImageUploadUrl(
    data.profileImageFilename,
  );

  return { mechanic: await attachMechanicImageUrls(mechanic), profileImageUploadUrl };
};

export const updateMechanicStatus = async (
  userId: number,
  isActive: boolean,
) => {
  const updated = await updateMechanicStatusByUserId(userId, isActive);
  if (!updated) {
    throw new NotFoundError("mechanic.profile_not_found");
  }
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new InternalServerError("mechanic.profile_reload_failed");
  }

  return attachMechanicImageUrls(mechanic);
};

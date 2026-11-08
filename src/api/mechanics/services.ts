import { z } from "zod";
import { BadRequestError } from "../../errors/bad_request_error";
import { InternalServerError } from "../../errors/internal_server_error";
import { NotFoundError } from "../../errors/not_found_error";
import { RequestValidationError } from "../../errors/request_validation_error";
import { customIssue } from "../../i18n/zod_issues";
import { distanceKm } from "../../utils/geo";
import {
  maxGarageImageCount,
  maxMechanicImageSizeBytes,
  mechanicImageUploadExpirationSeconds,
  mechanicsBucketName,
} from "../../utils/constants";
import {
  generateGetPresignedUrl,
  generateGetPresignedUrls,
  generateImagePostPolicy,
  generateToken,
} from "../../utils/functions";
import { findListingCityById } from "../listings/db";
import { getMechanicRatingSummary } from "../mechanic_reviews/services";
import {
  deleteGarageImageByOwner,
  findActiveMechanicsByCity,
  findCityById,
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

// Buyers look for workshops by city, so the pin must be in the chosen one:
// within the city's radius of its centre.
const assertPinInCity = async (location: {
  cityId: number;
  latitude: number;
  longitude: number;
}) => {
  const city = await findCityById(location.cityId);
  if (!city) {
    throw new RequestValidationError([
      customIssue(["cityId"], "car.city_not_found"),
    ]);
  }
  const { latitude, longitude, radiusKm } = city;
  if (latitude === null || longitude === null || radiusKm === null) {
    return;
  }
  if (distanceKm(location, { latitude, longitude }) > radiusKm) {
    throw new RequestValidationError([
      customIssue(["latitude"], "mechanic.location_outside_city", {
        city: city.name,
      }),
    ]);
  }
};

// A name of the API's own, so an upload never overwrites another file.
const buildMechanicImageName = (prefix: string, originalName: string) => {
  const extension = originalName.substring(originalName.lastIndexOf(".") + 1);
  return `${prefix}-${generateToken(16)}.${extension.toLowerCase()}`;
};

// A form the client posts the image to, limited to one image of at most 10 MB.
const createImageUpload = async (filename: string) => {
  const { postURL, formData } = await generateImagePostPolicy(
    mechanicsBucketName,
    filename,
    maxMechanicImageSizeBytes,
    mechanicImageUploadExpirationSeconds,
  );
  return { url: postURL, fields: formData };
};

// Swaps the profile image's original name for the stored one, and prepares
// its upload. null removes the image.
const prepareProfileImage = async <
  T extends { profileImageFilename?: string | null },
>(
  data: T,
) => {
  const original = data.profileImageFilename;
  if (!original) {
    return { values: data, profileImageUpload: undefined };
  }

  const filename = buildMechanicImageName("mechanic", original);
  try {
    return {
      values: { ...data, profileImageFilename: filename },
      profileImageUpload: await createImageUpload(filename),
    };
  } catch (error) {
    console.error("Error generating profile image upload:", error);
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

  await assertPinInCity(data);
  const { values, profileImageUpload } = await prepareProfileImage(data);
  await insertMechanic(userId, values);
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new InternalServerError("mechanic.profile_reload_failed");
  }

  return {
    mechanic: await attachRatingSummary(await attachMechanicImageUrls(mechanic)),
    profileImageUpload,
  };
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

  if (mechanic.garageImages.length + data.filenames.length > maxGarageImageCount) {
    throw new BadRequestError("mechanic.garage_images_limit", {
      max: maxGarageImageCount,
    });
  }

  const filenames = data.filenames.map((original) =>
    buildMechanicImageName("garage", original),
  );
  let uploads: { url: string; fields: Record<string, string> }[];
  try {
    uploads = await Promise.all(filenames.map(createImageUpload));
  } catch (error) {
    console.error("Error generating garage image uploads:", error);
    throw new InternalServerError("mechanic.garage_upload_urls_failed");
  }

  const garageImages = await insertGarageImages(mechanic.id, filenames);
  return {
    garageImages: garageImages.map((image, index) => ({
      id: image.id,
      filename: image.link,
      originalName: data.filenames[index],
      upload: uploads[index],
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
  const existing = await findMechanicByUserId(userId);
  if (!existing) {
    throw new NotFoundError("mechanic.profile_not_found");
  }
  if (
    data.cityId !== undefined ||
    data.latitude !== undefined ||
    data.longitude !== undefined
  ) {
    await assertPinInCity({
      cityId: data.cityId ?? existing.cityId,
      latitude: data.latitude ?? existing.latitude,
      longitude: data.longitude ?? existing.longitude,
    });
  }

  const { values, profileImageUpload } = await prepareProfileImage(data);
  await updateMechanicByUserId(userId, values);
  const mechanic = await findMechanicByUserId(userId);
  if (!mechanic) {
    throw new InternalServerError("mechanic.profile_reload_failed");
  }

  return {
    mechanic: await attachRatingSummary(await attachMechanicImageUrls(mechanic)),
    profileImageUpload,
  };
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

  return attachRatingSummary(await attachMechanicImageUrls(mechanic));
};

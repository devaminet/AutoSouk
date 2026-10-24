import { z, type ZodIssue } from "zod";
import {
  getProfileImageUrl,
  generateGetPresignedUrls,
  findObjectStat,
  generateUploadPostPolicy,
  removeObject,
  getFileType,
  generateToken,
} from "../../utils/functions";
import {
  createCarSchema,
  getListingsQuerySchema,
  updateListingSchema,
} from "./request_schema";
import { BadRequestError } from "../../errors/bad_request_error";
import { RequestValidationError } from "../../errors/request_validation_error";
import { NotFoundError } from "../../errors/not_found_error";
import {
  carBucketName,
  carMediaUploadExpirationSeconds,
  maxCarImageSizeBytes,
  maxCarVideoSizeBytes,
} from "../../utils/constants";
import {
  approveListingById,
  checkCarExistanceByListingId,
  deleteListingDetails,
  deleteCarMediaByIds,
  findCarMediaByListing,
  findCarReferencesByListingId,
  markCarMediaUploaded,
  findInvalidCarReferences,
  findMissingEquipmentIds,
  findListingById,
  type CarReferenceField,
  type CarReferenceIds,
  findListingCarId,
  findListings,
  getListingDetailsById,
  getUserListing,
  insertListing,
  saveCarAndMedia,
  updateListingAndMarkPending,
} from "./db";
import { InternalServerError } from "../../errors/internal_server_error";

const withProfileImageUrl = async <T extends { imageName: string | null }>(
  user: T,
) => {
  const { imageName, ...publicUser } = user;
  return { ...publicUser, imageUrl: await getProfileImageUrl(imageName) };
};

export const saveListing = async (
  title: string,
  description: string,
  userId: number,
) => {
  return await insertListing(title, description, userId);
};

const invalidReferenceMessages: Record<CarReferenceField, string> = {
  makeId: "Car make does not exist",
  modelId: "Car model does not exist for the selected make",
  carburantId: "Carburant does not exist",
  originId: "Origin does not exist",
  stateId: "State does not exist",
  cityId: "City does not exist",
};

const findCarReferenceIssues = async (
  ids: CarReferenceIds,
): Promise<ZodIssue[]> => {
  const invalidFields = await findInvalidCarReferences(ids);
  return invalidFields.map((field) => ({
    code: "custom",
    message: invalidReferenceMessages[field],
    path: [field],
  }));
};

const findEquipmentIssues = async (
  equipmentIds: number[],
): Promise<ZodIssue[]> => {
  const missingIds = await findMissingEquipmentIds(equipmentIds);
  return missingIds.map((id) => ({
    code: "custom",
    message: `Equipment ${id} does not exist`,
    path: ["equipmentIds"],
  }));
};

const throwIfIssues = (issues: ZodIssue[]) => {
  if (issues.length > 0) {
    throw new RequestValidationError(issues);
  }
};

const assertCarReferencesExist = async (ids: CarReferenceIds) => {
  throwIfIssues(await findCarReferenceIssues(ids));
};

const carMediaUploadLimits = {
  image: { maxSizeBytes: maxCarImageSizeBytes, contentTypePrefix: "image/" },
  video: { maxSizeBytes: maxCarVideoSizeBytes, contentTypePrefix: "video/" },
} as const;

type CarMediaType = keyof typeof carMediaUploadLimits;

const createCarMediaUploadPolicy = async (
  filename: string,
  type: CarMediaType,
) => {
  const { postURL, formData } = await generateUploadPostPolicy(
    carBucketName,
    filename,
    {
      ...carMediaUploadLimits[type],
      expirySeconds: carMediaUploadExpirationSeconds,
    },
  );

  return { url: postURL, fields: formData };
};

const buildCarMediaUpload = async (file: {
  name: string;
  isPrimary: boolean;
}) => {
  const filename = buildCarMediaName(file.name);
  const type = getFileType(file.name) ?? "image";

  return {
    upload: await createCarMediaUploadPolicy(filename, type),
    isPrimary: file.isPrimary,
    filename,
    originalName: file.name,
  };
};

const buildCarMediaName = (originalName: string) => {
  const extension = originalName.substring(originalName.lastIndexOf(".") + 1);
  return `car-${generateToken(16)}.${extension.toLowerCase()}`;
};

export const attachCarToListing = async (
  data: z.infer<typeof createCarSchema>,
  listingId: number,
  userId: number,
) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("Listing was not found");
  }

  const found = await checkCarExistanceByListingId(listingId);

  if (found) {
    throw new BadRequestError("A car is already attached to this listing");
  }

  const { files, equipmentIds = [], ...carDetails } = data;
  const [referenceIssues, equipmentIssues] = await Promise.all([
    findCarReferenceIssues(carDetails),
    findEquipmentIssues(equipmentIds),
  ]);
  throwIfIssues([...referenceIssues, ...equipmentIssues]);
  let carMedia: Awaited<ReturnType<typeof buildCarMediaUpload>>[] = [];
  try {
    carMedia = await Promise.all(files.map(buildCarMediaUpload));
  } catch (error) {
    console.error("Error generating car media upload policies:", error);
    throw new InternalServerError("Could not generate urls for images");
  }

  const car = await saveCarAndMedia({
    carDetails,
    carMedia,
    equipmentIds,
    listingId,
    userId,
  });

  if (!car) {
    throw new BadRequestError("A car is already attached to this listing");
  }

  return {
    car: { ...car, equipmentIds },
    carMedia,
  };
};

const isValidUploadedMedia = (
  stat: { size: number; metaData?: Record<string, string> },
  type: CarMediaType,
) => {
  const { maxSizeBytes, contentTypePrefix } = carMediaUploadLimits[type];
  const contentType = stat.metaData?.["content-type"] ?? "";
  return stat.size <= maxSizeBytes && contentType.startsWith(contentTypePrefix);
};

// Marks uploaded media as visible, drops invalid objects, and returns a new
// upload policy for media that never reached storage so the client can retry.
export const confirmListingMedia = async (
  listingId: number,
  userId: number,
) => {
  const media = await findCarMediaByListing(listingId, userId);
  if (media.length === 0) {
    throw new NotFoundError("No car media was found for this listing");
  }

  const uploadedIds: number[] = [];
  const rejected: { id: number; filename: string }[] = [];
  const pending: typeof media = [];

  for (const item of media.filter((entry) => !entry.isUploaded)) {
    const stat = await findObjectStat(carBucketName, item.link);
    if (!stat) {
      pending.push(item);
    } else if (isValidUploadedMedia(stat, item.type)) {
      uploadedIds.push(item.id);
    } else {
      rejected.push({ id: item.id, filename: item.link });
    }
  }

  await markCarMediaUploaded(uploadedIds);
  await deleteCarMediaByIds(rejected.map((item) => item.id));
  for (const item of rejected) {
    try {
      await removeObject(carBucketName, item.filename);
    } catch (error) {
      console.error("Error removing invalid car media:", error);
    }
  }

  const retry = await Promise.all(
    pending.map(async (item) => ({
      filename: item.link,
      upload: await createCarMediaUploadPolicy(item.link, item.type),
    })),
  );

  return {
    uploaded: media
      .filter((item) => item.isUploaded || uploadedIds.includes(item.id))
      .map((item) => item.link),
    rejected: rejected.map((item) => item.filename),
    pending: retry,
  };
};

export const getListingDetails = async (listingId: number) => {
  const listing = await getListingDetailsById(listingId);

  if (!listing) {
    throw new NotFoundError("Listing was not found!");
  }

  const carMedias = listing.car?.carMedias;
  if (carMedias) {
    const filenames = carMedias.map((media) => media.link);
    const urlsMap = await generateGetPresignedUrls(carBucketName, filenames);
    for (const media of carMedias) {
      media.link = urlsMap.get(media.link) || "";
    }
  }

  return {
    ...listing,
    user: listing.user ? await withProfileImageUrl(listing.user) : null,
  };
};

export const updateListing = async (
  listingId: number,
  userId: number,
  changes: z.infer<typeof updateListingSchema>,
) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("Listing was not found");
  }

  if (changes.car) {
    const currentCar = await findCarReferencesByListingId(listingId);
    if (!currentCar) {
      throw new BadRequestError(
        "Attach a car to this listing before editing it",
      );
    }

    const { makeId, modelId } = changes.car;
    await assertCarReferencesExist({
      ...changes.car,
      // a changed make or model must stay consistent with the stored one
      ...(makeId !== undefined || modelId !== undefined
        ? {
            makeId: makeId ?? currentCar.makeId ?? undefined,
            modelId: modelId ?? currentCar.modelId ?? undefined,
          }
        : {}),
    });
  }

  return await updateListingAndMarkPending(listingId, changes);
};

export const approveListing = async (listingId: number) => {
  const listing = await findListingById(listingId);

  if (!listing) {
    throw new NotFoundError("Listing not found");
  }

  if (listing.status === "approved") {
    throw new BadRequestError("Listing is already approved");
  }

  const result = await approveListingById(listingId);
  return result;
};

export const getListings = async (
  query: z.infer<typeof getListingsQuerySchema>,
) => {
  const { limit, page } = query;
  const { listings: foundListings, totalCountResult } =
    await findListings(query);

  for (const listing of foundListings) {
    const carMedias = listing.car?.carMedias;
    if (carMedias) {
      const filenames = carMedias.map((media) => media.link);
      const urlsMap = await generateGetPresignedUrls(carBucketName, filenames);
      for (const media of carMedias) {
        media.link = urlsMap.get(media.link) || "";
      }
    }
  }

  const listings = await Promise.all(
    foundListings.map(async (listing) => ({
      ...listing,
      user: listing.user ? await withProfileImageUrl(listing.user) : null,
    })),
  );

  const totalCount =
    totalCountResult.length > 0 ? totalCountResult[0]?.count : 0;

  return {
    listings,
    meta: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};

export const deleteListing = async (listingId: number, userId: number) => {
  const listing = await findListingCarId(userId, listingId);

  if (!listing) {
    throw new NotFoundError("Listing not found");
  }

  const carId = listing.car?.id;

  await deleteListingDetails(listingId, carId);

  return { deleted: true, listingId };
};

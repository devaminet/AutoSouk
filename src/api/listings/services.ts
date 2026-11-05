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
  getMyListingsQuerySchema,
  getPendingListingsQuerySchema,
  updateListingSchema,
} from "./request_schema";
import { BadRequestError } from "../../errors/bad_request_error";
import { RequestValidationError } from "../../errors/request_validation_error";
import { ErrorKey } from "../../i18n";
import { customIssue } from "../../i18n/zod_issues";
import { NotFoundError } from "../../errors/not_found_error";
import {
  carBucketName,
  carMediaUploadExpirationSeconds,
  maxCarMediaCount,
  minCarImageCount,
  maxCarImageSizeBytes,
  maxCarVideoSizeBytes,
} from "../../utils/constants";
import {
  applyCarMediaConfirmation,
  approvePendingListing,
  checkCarExistanceByListingId,
  countCompletedInspectionsByCar,
  countSellerListingsByStatus,
  deleteListingDetails,
  deleteCarMediaKeepingMinimum,
  setPrimaryCarMedia,
  findCarMediaByListing,
  findCarReferencesByListingId,
  insertCarMediaWithinLimit,
  findInvalidCarReferences,
  findMissingEquipmentIds,
  findListingById,
  type CarReferenceField,
  type CarReferenceIds,
  findListingCarId,
  findListings,
  findListingsBySeller,
  findPendingListings,
  getListingDetailsById,
  getUserListing,
  insertListing,
  rejectPendingListingById,
  saveCar,
  submitDraftListing,
  updateListingAfterSellerEdit,
} from "./db";
import { listingStatusEnum } from "../../db/schema/listing";
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

const invalidReferenceKeys: Record<CarReferenceField, ErrorKey> = {
  makeId: "car.make_not_found",
  modelId: "car.model_not_found",
  carburantId: "car.carburant_not_found",
  originId: "car.origin_not_found",
  stateId: "car.state_not_found",
  cityId: "car.city_not_found",
};

const findCarReferenceIssues = async (
  ids: CarReferenceIds,
): Promise<ZodIssue[]> => {
  const invalidFields = await findInvalidCarReferences(ids);
  return invalidFields.map((field) =>
    customIssue([field], invalidReferenceKeys[field]),
  );
};

const findEquipmentIssues = async (
  equipmentIds: number[],
): Promise<ZodIssue[]> => {
  const missingIds = await findMissingEquipmentIds(equipmentIds);
  return missingIds.map((id) =>
    customIssue(["equipmentIds"], "equipment.not_found", { id }),
  );
};

const throwIfIssues = (issues: ZodIssue[]) => {
  if (issues.length > 0) {
    throw new RequestValidationError(issues);
  }
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

const buildCarMediaUpload = async (file: { name: string }) => {
  const filename = buildCarMediaName(file.name);
  const type = getFileType(file.name) ?? "image";

  return {
    upload: await createCarMediaUploadPolicy(filename, type),
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
    throw new NotFoundError("listing.not_found");
  }

  if (listing.status !== "draft") {
    throw new BadRequestError("listing.not_draft");
  }

  const found = await checkCarExistanceByListingId(listingId);

  if (found) {
    throw new BadRequestError("listing.car_already_attached");
  }

  const { equipmentIds = [], ...carDetails } = data;
  const [referenceIssues, equipmentIssues] = await Promise.all([
    findCarReferenceIssues(carDetails),
    findEquipmentIssues(equipmentIds),
  ]);
  throwIfIssues([...referenceIssues, ...equipmentIssues]);

  const car = await saveCar({ carDetails, equipmentIds, listingId, userId });

  if (!car) {
    throw new BadRequestError("listing.car_already_attached");
  }

  return { ...car, equipmentIds };
};

const isValidUploadedMedia = (
  stat: { size: number; metaData?: Record<string, string> },
  type: CarMediaType,
) => {
  const { maxSizeBytes, contentTypePrefix } = carMediaUploadLimits[type];
  const contentType = stat.metaData?.["content-type"] ?? "";
  return stat.size <= maxSizeBytes && contentType.startsWith(contentTypePrefix);
};

// Returns an upload policy per new file. The media becomes visible once the
// client uploads it and calls confirmListingMedia.
export const addListingMedia = async (
  listingId: number,
  userId: number,
  files: { name: string }[],
) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }

  let uploads: Awaited<ReturnType<typeof buildCarMediaUpload>>[] = [];
  try {
    uploads = await Promise.all(files.map(buildCarMediaUpload));
  } catch (error) {
    console.error("Error generating car media upload policies:", error);
    throw new InternalServerError("media.upload_urls_failed");
  }

  const result = await insertCarMediaWithinLimit(
    listingId,
    uploads.map((upload) => upload.filename),
    maxCarMediaCount,
  );
  if (result.status === "no_car") {
    throw new BadRequestError("listing.car_required_for_media");
  }
  if (result.status === "over_limit") {
    throw new RequestValidationError([
      customIssue(["files"], "media.max_files", { count: maxCarMediaCount }),
    ]);
  }

  const ids = new Map(result.media.map(({ id, link }) => [link, id]));
  return uploads.map(({ filename, originalName, upload }) => ({
    id: ids.get(filename),
    filename,
    originalName,
    upload,
  }));
};

const withMediaUrls = async <T extends { link: string }>(media: T[]) => {
  const urlsMap = await generateGetPresignedUrls(
    carBucketName,
    media.map(({ link }) => link),
  );
  return media.map((item) => ({
    ...item,
    link: urlsMap.get(item.link) || "",
  }));
};

const removeStoredCarMedia = async (filenames: string[]) => {
  for (const filename of filenames) {
    try {
      await removeObject(carBucketName, filename);
    } catch (error) {
      console.error("Error removing deleted car media:", error);
    }
  }
};

// Deletes media from the seller's car. Outside a draft the car keeps at least
// the minimum number of uploaded images. Storage objects are removed after the
// database commit, so a storage failure never brings the deleted rows back.
export const deleteListingMedia = async (
  listingId: number,
  userId: number,
  mediaIds: number[],
) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }

  const result = await deleteCarMediaKeepingMinimum(
    listingId,
    mediaIds,
    minCarImageCount,
  );
  if (result.status === "no_car") {
    throw new BadRequestError("listing.car_required");
  }
  if (result.status === "unknown_media") {
    throw new RequestValidationError(
      result.mediaIds.map((id) =>
        customIssue(["mediaIds"], "media.unknown", { id }),
      ),
    );
  }
  if (result.status === "below_minimum") {
    throw new RequestValidationError([
      customIssue(["mediaIds"], "media.min_images", {
        count: minCarImageCount,
      }),
    ]);
  }

  await removeStoredCarMedia(result.deleted.map(({ link }) => link));

  return {
    deleted: result.deleted.map(({ id }) => id),
    carMedias: await withMediaUrls(result.remaining),
  };
};

// Changing the primary image only reorders reviewed media, so the listing
// keeps its approval status.
export const setListingPrimaryMedia = async (
  listingId: number,
  userId: number,
  mediaId: number,
) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }

  const result = await setPrimaryCarMedia(listingId, mediaId);
  switch (result.status) {
    case "no_car":
      throw new BadRequestError("listing.car_required");
    case "not_found":
      throw new NotFoundError("media.not_found");
    case "not_image":
      throw new BadRequestError("media.primary_not_image");
    case "not_uploaded":
      throw new BadRequestError("media.primary_not_uploaded");
    case "updated":
      return { carMedias: await withMediaUrls(result.media) };
  }
};

// Marks uploaded media as visible, drops invalid objects, gives the car a
// primary image if it has none, and returns the id and a new upload policy of
// media that never reached storage, so the client can retry or delete it.
export const confirmListingMedia = async (
  listingId: number,
  userId: number,
) => {
  const media = await findCarMediaByListing(listingId, userId);
  if (media.length === 0) {
    throw new NotFoundError("media.none_for_listing");
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

  await applyCarMediaConfirmation(
    listingId,
    uploadedIds,
    rejected.map((item) => item.id),
  );
  for (const item of rejected) {
    try {
      await removeObject(carBucketName, item.filename);
    } catch (error) {
      console.error("Error removing invalid car media:", error);
    }
  }

  const retry = await Promise.all(
    pending.map(async (item) => ({
      id: item.id,
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

type ListingDetails = NonNullable<
  Awaited<ReturnType<typeof getListingDetailsById>>
>;

// Flattens the car_equipment join rows into the catalog display order.
const toCarEquipment = (
  rows: NonNullable<ListingDetails["car"]>["equipment"],
) =>
  rows
    .map(({ equipment }) => equipment)
    .sort(
      (a, b) =>
        a.category.position - b.category.position || a.position - b.position,
    )
    .map(({ id, slug, name, category }) => ({
      id,
      slug,
      name,
      category: { slug: category.slug, name: category.name },
    }));

type ListingStatus = (typeof listingStatusEnum.enumValues)[number];

type ListingViewer = { id: number; role: string } | undefined;

// Only approved listings are public. Other statuses answer 404, as if the
// listing did not exist, except for its seller and admins.
const canViewListing = (
  listing: { status: string | null; userId: number | null },
  viewer: ListingViewer,
) =>
  listing.status === "approved" ||
  viewer?.role === "admin" ||
  viewer?.id === listing.userId;

export const getListingDetails = async (
  listingId: number,
  viewer: ListingViewer,
) => {
  const found = await getListingDetailsById(listingId);

  if (!found || !canViewListing(found, viewer)) {
    throw new NotFoundError("listing.not_found");
  }

  const { userId, ...listing } = found;

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
    car: listing.car
      ? { ...listing.car, equipment: toCarEquipment(listing.car.equipment) }
      : null,
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
    throw new NotFoundError("listing.not_found");
  }

  if (changes.car) {
    const currentCar = await findCarReferencesByListingId(listingId);
    if (!currentCar) {
      throw new BadRequestError("listing.car_required");
    }

    const { equipmentIds, ...carReferences } = changes.car;
    const { makeId, modelId } = carReferences;
    const [referenceIssues, equipmentIssues] = await Promise.all([
      findCarReferenceIssues({
        ...carReferences,
        // a changed make or model must stay consistent with the stored one
        ...(makeId !== undefined || modelId !== undefined
          ? {
              makeId: makeId ?? currentCar.makeId ?? undefined,
              modelId: modelId ?? currentCar.modelId ?? undefined,
            }
          : {}),
      }),
      findEquipmentIssues(equipmentIds ?? []),
    ]);
    throwIfIssues([...referenceIssues, ...equipmentIssues]);
  }

  return await updateListingAfterSellerEdit(listingId, changes);
};

const throwTooFewImages = (): never => {
  throw new BadRequestError("media.min_images", { count: minCarImageCount });
};

// Sends a complete draft to review. Files that are not uploaded yet do not
// block it and stay hidden.
export const submitListing = async (listingId: number, userId: number) => {
  const listing = await getUserListing(listingId, userId);
  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }

  const result = await submitDraftListing(listingId, minCarImageCount);
  switch (result.status) {
    case "not_draft":
      throw new BadRequestError("listing.not_draft");
    case "no_car":
      throw new BadRequestError("listing.car_required");
    case "too_few_images":
      return throwTooFewImages();
    case "no_primary":
      throw new BadRequestError("media.primary_required");
    case "submitted":
      return result.listing;
  }
};

export const approveListing = async (listingId: number) => {
  const listing = await findListingById(listingId);

  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }

  if (listing.status === "approved") {
    throw new BadRequestError("listing.already_approved");
  }

  const result = await approvePendingListing(listingId, minCarImageCount);
  switch (result.status) {
    case "not_pending":
      throw new BadRequestError("listing.not_pending");
    case "no_car":
      throw new BadRequestError("listing.car_required");
    case "too_few_images":
      return throwTooFewImages();
    case "approved":
      return result.listings;
  }
};

export const rejectListing = async (listingId: number, reason: string) => {
  const listing = await findListingById(listingId);

  if (!listing) {
    throw new NotFoundError("listing.not_found");
  }

  const rejected = await rejectPendingListingById(listingId, reason);
  if (!rejected) {
    throw new BadRequestError("listing.not_pending");
  }

  return rejected;
};

const signCarMediaLinks = async (
  listings: { car: { carMedias: { link: string }[] } | null }[],
) => {
  for (const listing of listings) {
    const carMedias = listing.car?.carMedias;
    if (carMedias) {
      const filenames = carMedias.map((media) => media.link);
      const urlsMap = await generateGetPresignedUrls(carBucketName, filenames);
      for (const media of carMedias) {
        media.link = urlsMap.get(media.link) || "";
      }
    }
  }
};

export const getPendingListings = async (
  query: z.infer<typeof getPendingListingsQuerySchema>,
) => {
  const { limit, page } = query;
  const { listings: found, total } = await findPendingListings(query);

  await signCarMediaLinks(found);

  const listings = await Promise.all(
    found.map(async (listing) => ({
      ...listing,
      user: listing.user ? await withProfileImageUrl(listing.user) : null,
    })),
  );

  return {
    listings,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// Every status is present, with 0 when the seller has no listing in it.
const toStatusCounts = (
  rows: { status: ListingStatus | null; total: number }[],
) => {
  const counts = Object.fromEntries(
    listingStatusEnum.enumValues.map((status) => [status, 0]),
  ) as Record<ListingStatus, number>;
  for (const { status, total } of rows) {
    if (status) {
      counts[status] = total;
    }
  }
  return counts;
};

export const getMyListings = async (
  userId: number,
  query: z.infer<typeof getMyListingsQuerySchema>,
) => {
  const { limit, page } = query;
  const [{ listings, total }, statusRows] = await Promise.all([
    findListingsBySeller(userId, query),
    countSellerListingsByStatus(userId),
  ]);

  await signCarMediaLinks(listings);

  const inspectionRows = await countCompletedInspectionsByCar(
    listings.flatMap(({ car }) => (car ? [car.id] : [])),
  );
  const completedByCar = new Map(
    inspectionRows.map(({ carId, total }) => [carId, total]),
  );

  return {
    listings: listings.map((listing) => ({
      ...listing,
      completedInspectionsCount: listing.car
        ? (completedByCar.get(listing.car.id) ?? 0)
        : 0,
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      statusCounts: toStatusCounts(statusRows),
    },
  };
};

export const getListings = async (
  query: z.infer<typeof getListingsQuerySchema>,
) => {
  const { limit, page } = query;
  const { listings: foundListings, totalCountResult } =
    await findListings(query);

  await signCarMediaLinks(foundListings);

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
    throw new NotFoundError("listing.not_found");
  }

  const carId = listing.car?.id;

  await deleteListingDetails(listingId, carId);

  return { deleted: true, listingId };
};

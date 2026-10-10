import { minioClient } from "./minio";
import { defaultProfileImageName, usersBucketName } from "../utils/constants";

const defaultProfileImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><rect width="128" height="128" fill="#e5e7eb"/><circle cx="64" cy="48" r="22" fill="#9ca3af"/><path d="M20 118c0-24 20-40 44-40s44 16 44 40z" fill="#9ca3af"/></svg>`;

export const ensureDefaultProfileImage = async () => {
  try {
    await minioClient.statObject(usersBucketName, defaultProfileImageName);
  } catch {
    await minioClient.putObject(
      usersBucketName,
      defaultProfileImageName,
      Buffer.from(defaultProfileImageSvg),
      undefined,
      { "Content-Type": "image/svg+xml" },
    );
  }
};

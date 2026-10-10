import "dotenv/config";
import { app } from "./app";
import "./file_storage/minio";
import { seeds } from "./db/seeds";
import { ensureDefaultProfileImage } from "./file_storage/default_profile_image";
import { createBucket } from "./utils/functions";
import {
  carBucketName,
  inspectionReportsBucketName,
  mechanicsBucketName,
  usersBucketName,
} from "./utils/constants";

const SERVER_PORT = process.env.SERVER_PORT;

const main = async () => {
  await seeds();
  await createBucket(carBucketName);
  await createBucket(mechanicsBucketName);
  await createBucket(inspectionReportsBucketName);
  await createBucket(usersBucketName);
  await ensureDefaultProfileImage();

  app.listen(SERVER_PORT, () => {
    console.log(`Server is running on port ${SERVER_PORT}...`);
  });
};

main();

import "dotenv/config";
import { app } from "./app";
import "./file_storage/minio";
import { seeds } from "./db/seeds";
import { ensureDefaultProfileImage } from "./file_storage/default_profile_image";
import { createBucket } from "./utils/functions";
import { configureSms } from "./utils/sms";
import {
  carBucketName,
  inspectionReportsBucketName,
  mechanicsBucketName,
  usersBucketName,
  identityBucketName,
} from "./utils/constants";

const SERVER_PORT = process.env.SERVER_PORT;

const main = async () => {
  console.log(`SMS providers: ${configureSms().join(", ")}`);
  await seeds();
  await createBucket(carBucketName);
  await createBucket(mechanicsBucketName);
  await createBucket(inspectionReportsBucketName);
  await createBucket(usersBucketName);
  await createBucket(identityBucketName);
  await ensureDefaultProfileImage();

  app.listen(SERVER_PORT, () => {
    console.log(`Server is running on port ${SERVER_PORT}...`);
  });
};

main();

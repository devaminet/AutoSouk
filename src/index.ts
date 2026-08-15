import "dotenv/config";
import { app } from "./app";
import "./file_storage/minio";
import { seeds } from "./db/seeds";
import { createBucket } from "./utils/functions";
import { carBucketName } from "./utils/constants";

const SERVER_PORT = process.env.SERVER_PORT;

const main = async () => {
  await seeds();
  await createBucket(carBucketName);

  app.listen(SERVER_PORT, () => {
    console.log(`Server is running on port ${SERVER_PORT}...`);
  });
};

main();

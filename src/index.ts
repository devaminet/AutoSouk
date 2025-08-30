import "dotenv/config";
import { app } from "./app";
import "./file_storage/minio";
import { seeds } from "./db/seeds";
import { createBucket } from "./utils/functions";

const main = async () => {
  await seeds();
  await createBucket("cars");

  app.listen(process.env.SERVER_PORT, () => {
    console.log("Server is running...");
  });
};

main();

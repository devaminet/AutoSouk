import "dotenv/config";
import type { Server } from "http";
import { app } from "./app";
import { pool } from "./db";
import {
  connectRedis,
  disconnectRedis,
  getRedisClients,
} from "./cache/redis";
import "./file_storage/minio";
import { seeds } from "./db/seeds";
import { ensureDefaultProfileImage } from "./file_storage/default_profile_image";
import { createBucket } from "./utils/functions";
import { loadSettings, startSettingsRefresh } from "./settings/store";
import {
  carBucketName,
  inspectionReportsBucketName,
  mechanicsBucketName,
  usersBucketName,
} from "./utils/constants";

const SERVER_PORT = process.env.SERVER_PORT;

const SHUTDOWN_TIMEOUT_MS = 10_000;

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

// Stops accepting connections, lets in-flight requests finish, then closes
// Redis and the database pool. A stuck shutdown is forced after a timeout.
const registerGracefulShutdown = (server: Server) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`${signal} received, shutting down...`);
    setTimeout(() => {
      console.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    try {
      await closeServer(server);
      await disconnectRedis();
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

const main = async () => {
  // Builds the clients first so a missing or invalid REDIS_URL fails boot.
  getRedisClients();
  // Not awaited: Redis is a cache, so the app starts while it is down and
  // the client keeps reconnecting in the background.
  connectRedis().catch((error) =>
    console.error("Could not connect to Redis:", error),
  );
  await seeds();
  await loadSettings();
  startSettingsRefresh();
  await createBucket(carBucketName);
  await createBucket(mechanicsBucketName);
  await createBucket(inspectionReportsBucketName);
  await createBucket(usersBucketName);
  await ensureDefaultProfileImage();

  const server = app.listen(SERVER_PORT, () => {
    console.log(`Server is running on port ${SERVER_PORT}...`);
  });
  registerGracefulShutdown(server);
};

main();

import * as Minio from "minio";

const {
  MINIO_ENDPOINT,
  MINIO_PORT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  NODE_ENV,
} = process.env;

export const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT!,
  port: MINIO_PORT ? Number(MINIO_PORT) : 9000,
  useSSL: NODE_ENV === "production" ? true : false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

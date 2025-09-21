import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import nodemailer from "nodemailer";
import Mail, { Attachment } from "nodemailer/lib/mailer";
import { minioClient } from "../file_storage/minio";

const imageTypes = ["jpg", "jpeg", "png", "webp"];
const videoTypes = ["mp4"];
export const allowedFileTypes = [...imageTypes, ...videoTypes].join(", ");

export const generateToken = (size = 32) => {
  return crypto.randomBytes(size).toString("hex");
};

export const sendMail = async (options: {
  from?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
}) => {
  const { SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAILER_FROM } =
    process.env;
  const { attachments, subject, to, from, html, text } = options;
  const transporter = nodemailer.createTransport({
    host: SMTP_SERVER!,
    port: Number(SMTP_PORT!),
    secure: false,
    auth: {
      user: SMTP_USER!,
      pass: SMTP_PASSWORD!,
    },
  });

  const mailOptions: Mail.Options = {
    from: from || MAILER_FROM,
    to,
    subject,
  };

  if (html) {
    mailOptions.html = html;
  }

  if (text) {
    mailOptions.text = text;
  }

  if (attachments) {
    mailOptions.attachments = attachments;
  }

  await transporter.sendMail(mailOptions);
};

export const readTemplateFile = async (
  fileName: string,
  data: Record<string, unknown>
): Promise<string> => {
  const template = await fs.readFile(
    path.resolve(__dirname, `../templates/${fileName}`),
    { encoding: "utf8" }
  );
  const html = ejs.render(template, data);
  return html;
};

export const readSeedFile = async (fileName: string) => {
  const data = await fs.readFile(
    path.join(__dirname, `../db/seeds/data/${fileName}.json`),
    {
      encoding: "utf8",
    }
  );
  return data;
};

export const createBucket = async (bucketName: string) => {
  const exist = await minioClient.bucketExists(bucketName);
  if (!exist) {
    await minioClient.makeBucket(bucketName);
  }
};

export const generatePresignedUrl = async (
  bucketName: string,
  filename: string,
  expires?: number
) => {
  return minioClient.presignedPutObject(bucketName, filename, expires);
};

export const generatePresignedUrls = async (
  bucketName: string,
  filenames: string[]
) => {
  const promises = filenames.map((filename) =>
    generatePresignedUrl(bucketName, filename)
  );
  const results = await Promise.allSettled(promises);

  return results.reduce<Map<string, string>>((prev, curr, index) => {
    if (curr.status === "fulfilled") {
      prev.set(filenames[index], curr.value);
    }
    return prev;
  }, new Map());
};

export const getFileType = (file: string) => {
  const extenstion = file.substring(file.lastIndexOf(".") + 1);
  if (imageTypes.includes(extenstion)) {
    return "image";
  }
  if (videoTypes.includes(extenstion)) {
    return "video";
  }
  return null;
};

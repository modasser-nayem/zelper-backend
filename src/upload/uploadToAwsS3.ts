/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import { Readable } from "stream";
import { v4 as uuid } from "uuid";
import AppError from "../errors/AppError";
import config from "../config";

// ===============================
// HELPER: Detect Content-Type from extension
// ===============================
const getContentType = (
  fileName: string,
  defaultType = "application/octet-stream",
) => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext || ""] || defaultType;
};

interface UploadResponse {
  url: string;
}

interface FileObject {
  originalname: string;
  path?: string;
  buffer?: Buffer;
  mimetype: string;
}

// ===============================
// S3 CLIENT CONFIG
// ===============================
const s3Client = new S3Client({
  region: config.aws.AWS_REGION,
  credentials: {
    accessKeyId: config.aws.AWS_ACCESS_KEY,
    secretAccessKey: config.aws.AWS_SECRET_KEY,
  },
});

// ===============================
// HELPER: Generate pre-signed URL
// ===============================
const generatePresignedUrl = async (
  key: string,
  expiresInSeconds = 604800, // max 7 days
) => {
  const contentType = getContentType(key);
  const command = new GetObjectCommand({
    Bucket: config.aws.AWS_S3_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: "inline",
    ResponseContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: expiresInSeconds,
  });
};

// ===============================
// HELPER: Generate public URL
// ===============================
const getPublicUrl = (key: string) => {
  return `https://${config.aws.AWS_S3_BUCKET_NAME}.s3.${config.aws.AWS_REGION}.amazonaws.com/${key}`;
};

// ===============================
// HELPER: Extract Key from URL
// ===============================
const extractKeyFromUrl = (url: string) => {
  const baseUrl = `https://${config.aws.AWS_S3_BUCKET_NAME}.s3.${config.aws.AWS_REGION}.amazonaws.com/`;
  if (!url.startsWith(baseUrl)) {
    throw new AppError(400, "Invalid S3 URL");
  }
  const keyWithParams = url.replace(baseUrl, "");
  return keyWithParams.split("?")[0];
};

// ===============================
// UPLOAD SINGLE FILE
// ===============================
const uploadSingleToAWS = async (
  file: FileObject,
  folderName = "general",
): Promise<UploadResponse> => {
  try {
    if (!file) {
      throw new AppError(400, "File is required");
    }

    let fileBody: Buffer | Readable;

    if (file.path) {
      await fs.promises.access(file.path, fs.constants.F_OK);
      fileBody = fs.createReadStream(file.path);
    } else if (file.buffer) {
      fileBody = file.buffer;
    } else {
      throw new AppError(400, "Neither file path nor buffer is available");
    }

    const safeFileName = file.originalname.replace(/\s+/g, "-");
    const fileKey = `${folderName}/${uuid()}-${safeFileName}`;
    const contentType = getContentType(safeFileName, file.mimetype);

    const command = new PutObjectCommand({
      Bucket: config.aws.AWS_S3_BUCKET_NAME,
      Key: fileKey,
      Body: fileBody,
      ContentType: contentType,
      ContentDisposition: "inline",
      // ACL removed for ACL-free bucket
    });

    await s3Client.send(command);

    // Return pre-signed URL with "inline" view instruction
    const presignedUrl = await generatePresignedUrl(fileKey);

    return { url: presignedUrl };
  } catch (error: any) {
    console.error("S3 Upload Error:", error);
    throw new AppError(500, error?.message || "Failed to upload file");
  }
};

// ===============================
// UPLOAD MULTIPLE FILES
// ===============================
const uploadMultipleToAWS = async (
  files: FileObject[],
  folderName = "general",
): Promise<UploadResponse[]> => {
  try {
    if (!files || files.length === 0) {
      throw new AppError(400, "Files are required");
    }

    const uploadPromises = files.map((file) =>
      uploadSingleToAWS(file, folderName),
    );
    const results = await Promise.all(uploadPromises);

    return results;
  } catch (error: any) {
    console.error("S3 Multiple Upload Error:", error);
    throw new AppError(500, error?.message || "Failed to upload files");
  }
};

// ===============================
// UPLOAD PDF BUFFER
// ===============================
const uploadPDFBufferToAWS = async (
  pdfBuffer: Uint8Array,
  fileName: string,
  folderName = "pdf",
): Promise<UploadResponse> => {
  try {
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new AppError(400, "PDF buffer is empty");
    }

    const safeFileName = fileName.replace(/\s+/g, "-");
    const fileKey = `${folderName}/${uuid()}-${safeFileName}.pdf`;

    const command = new PutObjectCommand({
      Bucket: config.aws.AWS_S3_BUCKET_NAME,
      Key: fileKey,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      ContentDisposition: "inline",
    });

    await s3Client.send(command);

    const presignedUrl = await generatePresignedUrl(fileKey);
    return { url: presignedUrl };
  } catch (error: any) {
    console.error("PDF Upload Error:", error);
    throw new AppError(500, error?.message || "Failed to upload PDF");
  }
};

// ===============================
// DELETE SINGLE FILE (from pre-signed URL or direct URL)
// ===============================
const deleteSingleFromAWS = async (fileUrl: string): Promise<void> => {
  try {
    if (!fileUrl) {
      throw new AppError(400, "File URL is required");
    }

    const key = extractKeyFromUrl(fileUrl);

    const command = new DeleteObjectCommand({
      Bucket: config.aws.AWS_S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error: any) {
    console.error("S3 Delete Error:", error);
    throw new AppError(500, error?.message || "Failed to delete file");
  }
};

// ===============================
// DELETE MULTIPLE FILES
// ===============================
const deleteMultipleFromAWS = async (fileUrls: string[]): Promise<void> => {
  try {
    if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
      throw new AppError(400, "No file URLs provided");
    }

    const objectKeys = fileUrls.map((url) => ({
      Key: extractKeyFromUrl(url),
    }));

    const command = new DeleteObjectsCommand({
      Bucket: config.aws.AWS_S3_BUCKET_NAME,
      Delete: { Objects: objectKeys },
    });

    await s3Client.send(command);
  } catch (error: any) {
    console.error("S3 Multiple Delete Error:", error);
    throw new AppError(500, error?.message || "Failed to delete files");
  }
};

// ===============================
// EXPORT
// ===============================
export const UploadToAwsHelper = {
  uploadSingleToAWS,
  uploadMultipleToAWS,
  uploadPDFBufferToAWS,
  deleteSingleFromAWS,
  deleteMultipleFromAWS,
  generatePresignedUrl,
};

import multer from "multer";

// =========================
//    File Upload
// =========================
// Memory storage configuration
const storage = multer.memoryStorage();

export const uploadFile = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

// =========================
// Generic Upload Abstraction
// =========================
import { UploadToAwsHelper } from "./uploadToAwsS3";

export const FileUploadHelper = {
  uploadSingle: UploadToAwsHelper.uploadSingleToAWS,
  uploadMultiple: UploadToAwsHelper.uploadMultipleToAWS,
  uploadPDFBuffer: UploadToAwsHelper.uploadPDFBufferToAWS,
  deleteSingle: UploadToAwsHelper.deleteSingleFromAWS,
  deleteMultiple: UploadToAwsHelper.deleteMultipleFromAWS,
};

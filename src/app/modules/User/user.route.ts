import express from "express";
import { userValidationSchema } from "./user.validation";
import requestValidate from "../../middlewares/validateRequest";
import { auth } from "../../middlewares/auth";
import { uploadFile } from "../../../upload/fileUpload";
import { UserController } from "./user.controller";
import { parseFormData } from "../../middlewares/parseFormData";

const router = express.Router();

// Get my profile
router.get("/profile", auth(), UserController.getMyProfile);

// Update my profile (Accepts 'file' and JSON stringified 'data' under form-data)
router.put(
  "/profile",
  auth(),
  uploadFile.single("file"),
  parseFormData,
  requestValidate(userValidationSchema.updateUser),
  UserController.updateProfile,
);

// Delete My Account
router.delete("/profile", auth(), UserController.deleteAccount);

// Request helper verification
router.put(
  "/profile/helper-verification",
  auth(),
  uploadFile.single("file"),
  parseFormData,
  UserController.requestHelperVerification,
);

// ========== Admin ===========

// Get all  users
router.get("/", auth("ADMIN"), UserController.getAllUsers);

// Get single user by id
router.get("/:id", auth("ADMIN"), UserController.getSingleUser);

// Update user status
router.patch("/:id/status", auth("ADMIN"), UserController.updateUserStatus);

// Update helper verification status
router.patch(
  "/:id/helper-status",
  auth("ADMIN"),
  requestValidate(userValidationSchema.updateHelperStatus),
  UserController.updateHelperStatus,
);

export const userRoutes = router;

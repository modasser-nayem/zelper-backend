import express from "express";
import { userValidationSchema } from "./user.validation";
import requestValidate from "../../middlewares/validateRequest";
import { auth } from "../../middlewares/auth";
import { uploadFile } from "../../../upload/fileUpload";
import { UserController } from "./user.controller";

const router = express.Router();

// Get my profile
router.get("/profile", auth(), UserController.getMyProfile);

// Update my profile
router.put(
  "/profile",
  auth(),
  requestValidate(userValidationSchema.updateUser),
  UserController.updateProfile,
);

// Update Profile avatar
router.put(
  "/profile/avatar",
  auth(),
  uploadFile.single("file"),
  UserController.updateProfilePicture,
);

// Delete My Account
router.delete("/profile", auth(), UserController.deleteAccount);

// Request provider verification
router.put(
  "/profile/provider-verification",
  auth(),
  uploadFile.array("files"),
  UserController.requestProviderVerification,
);

// Switch role between CUSTOMER and PROVIDER
router.patch(
  "/switch-role",
  auth(),
  requestValidate(userValidationSchema.switchRole),
  UserController.switchRole,
);

// ========== Admin ===========

// Get all  users
router.get("/", auth("ADMIN"), UserController.getAllUsers);

// Get single user by id
router.get("/:id", auth("ADMIN"), UserController.getSingleUser);

// Block User
router.patch("/:id/status", auth("ADMIN"), UserController.updateUserStatus);

// Update provider verification status
router.patch(
  "/:id/provider-status",
  auth("ADMIN"),
  requestValidate(userValidationSchema.updateProviderStatus),
  UserController.updateProviderStatus,
);

export const userRoutes = router;

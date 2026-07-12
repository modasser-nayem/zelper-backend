import { Router } from "express";
import { AuthController } from "./auth.controller";
import { AuthValidation } from "./auth.validation";
import validateRequest from "../../middlewares/validateRequest";
import { auth } from "../../middlewares/auth";
import { uploadFile } from "../../../upload/fileUpload";

const router = Router();

// Create account
router.post(
  "/signup",
  validateRequest(AuthValidation.signup),
  AuthController.createAccount,
);

// Login user
router.post(
  "/login",
  validateRequest(AuthValidation.login),
  AuthController.loginUser,
);

// Social login
router.post(
  "/social-login",
  validateRequest(AuthValidation.socialLogin),
  AuthController.socialLogin,
);

// Forgot password
router.post(
  "/forgot-password",
  validateRequest(AuthValidation.forgotPassword),
  AuthController.forgotPassword,
);

// Verify Otp
router.post(
  "/verify-otp",
  validateRequest(AuthValidation.verifyOtp),
  AuthController.verifyOtp,
);

// Reset password
router.post(
  "/reset-password",
  validateRequest(AuthValidation.resetPassword),
  AuthController.resetPassword,
);

// change password
router.patch(
  "/change-password",
  auth(),
  validateRequest(AuthValidation.changePassword),
  AuthController.changePassword,
);

// Refresh token
router.post("/refresh-token", AuthController.refreshToken);

// Logout
router.post("/logout", AuthController.logoutUser);

export const AuthRoutes = router;

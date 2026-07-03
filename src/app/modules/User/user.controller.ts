import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { UserService } from "./user.services";
import pickOptions from "../../../shared/pick";
import { COOKIE_NAME, setCookie } from "../../../helpers/cookie";

export const UserController = {
  // get user profile
  getMyProfile: catchAsync(async (req, res) => {
    const user = req.user;

    const result = await UserService.getMyProfile(user.id);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "User profile retrieved successfully",
      data: result,
    });
  }),

  // Update user profile
  updateProfile: catchAsync(async (req, res) => {
    const user = req.user;

    const result = await UserService.updateProfile({
      userId: user.id,
      data: req.body,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Profile updated successfully!",
      data: result,
    });
  }),

  // Update user profile
  updateProfilePicture: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const file = req.file as Express.Multer.File;

    const result = await UserService.updateProfilePicture({
      userId,
      file,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Profile Picture Saved!",
      data: result,
    });
  }),

  // Get all users
  getAllUsers: catchAsync(async (req, res) => {
    const filters = pickOptions(req.query, [
      "searchTerm",
      "role",
      "status",
      "gender",
    ]);
    const options = pickOptions(req.query, [
      "page",
      "limit",
      "sortBy",
      "sortOrder",
    ]);

    const result = await UserService.getAllUsers({ filters, options });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Users retrieve successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // Get Single User
  getSingleUser: catchAsync(async (req, res) => {
    const id = req.params.id;
    const result = await UserService.getSingleUser(id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User retrieve successfully!",
      data: result,
    });
  }),

  // Update user account status
  updateUserStatus: catchAsync(async (req, res) => {
    const id = req.params.id;
    const result = await UserService.updateUserStatus(id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Successfully ${result.status === "SUSPENDED" ? "suspended" : "activated"} user`,
      data: result,
    });
  }),

  // Delete Account
  deleteAccount: catchAsync(async (req, res) => {
    const id = req.user.id;
    const result = await UserService.deleteAccount(id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Account Successfully Deleted",
      data: result,
    });
  }),

  // Request provider verification
  requestProviderVerification: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const files = req.files as Express.Multer.File[];

    const result = await UserService.requestProviderVerification({
      userId,
      files,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Provider verification request submitted successfully!",
      data: result,
    });
  }),

  // Update provider status (Admin)
  updateProviderStatus: catchAsync(async (req, res) => {
    const id = req.params.id;
    const { status, rejectionReason } = req.body;

    const result = await UserService.updateProviderStatus({
      id,
      status,
      rejectionReason,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Provider status successfully updated to ${status}!`,
      data: result,
    });
  }),

  // Switch role between CUSTOMER and PROVIDER
  switchRole: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { role } = req.body;

    const result = await UserService.switchRole({
      userId,
      role,
    });

    setCookie({
      res,
      cookieName: COOKIE_NAME.REFRESH_TOKEN,
      token: result.refreshToken,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Role switched successfully to ${role}!`,
      data: result,
    });
  }),
};

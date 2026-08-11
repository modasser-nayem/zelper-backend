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
    const file = req.file as Express.Multer.File;

    const result = await UserService.updateProfile({
      userId: user.id,
      data: req.body,
      file,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Profile updated successfully!",
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
      "verification_status",
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

  // Request helper verification (Supports array of files, replace, upload new & delete)
  requestHelperVerification: catchAsync(async (req, res) => {
    const userId = req.user.id;

    const files: Express.Multer.File[] = Array.isArray(req.files)
      ? (req.files as Express.Multer.File[])
      : req.file
        ? [req.file as Express.Multer.File]
        : [];

    const result = await UserService.requestHelperVerification({
      userId,
      files,
      body: req.body,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Helper verification documents processed successfully!",
      data: result,
    });
  }),

  // Update helper verification status (Admin)
  updateHelperStatus: catchAsync(async (req, res) => {
    const id = req.params.id;
    const { status, rejectionReason } = req.body;

    const result = await UserService.updateHelperStatus({
      id,
      status,
      rejectionReason,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Helper status successfully updated to ${status}!`,
      data: result,
    });
  }),
};

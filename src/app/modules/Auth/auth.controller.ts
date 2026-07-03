import status from "http-status";
import { AuthService } from "./auth.service";
import { Request } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { COOKIE_NAME, setCookie } from "../../../helpers/cookie";

export const AuthController = {
  createAccount: catchAsync(async (req, res) => {
    const result = await AuthService.createAccount({
      data: req.body,
    });

    setCookie({
      res,
      cookieName: COOKIE_NAME.REFRESH_TOKEN,
      token: result.refreshToken,
    });

    sendResponse(res, {
      statusCode: status.CREATED,
      message: "Successfully registered account!",
      data: result,
    });
  }),

  // User login
  loginUser: catchAsync(async (req, res) => {
    const result = await AuthService.loginUser(req.body);

    setCookie({
      res,
      cookieName: COOKIE_NAME.REFRESH_TOKEN,
      token: result.refreshToken!,
    });

    sendResponse(res, {
      statusCode: status.OK,
      message: "User logged in successfully!",
      data: result,
    });
  }),

  // Social login
  socialLogin: catchAsync(async (req, res) => {
    const result = await AuthService.socialLogin(req.body);

    setCookie({
      res,
      cookieName: COOKIE_NAME.REFRESH_TOKEN,
      token: result.refreshToken,
    });

    sendResponse(res, {
      statusCode: status.OK,
      message: "User logged in successfully!",
      data: result,
    });
  }),

  forgotPassword: catchAsync(async (req, res) => {
    const result = await AuthService.forgotPassword(req.body.email);

    sendResponse(res, {
      statusCode: status.OK,
      message:
        "We have sent a 6-digit OTP to your email address, Please check!",
      data: result,
    });
  }),

  // Verify OTP
  verifyOtp: catchAsync(async (req, res) => {
    const result = await AuthService.verifyOTP(req.body);

    sendResponse(res, {
      statusCode: status.OK,
      message: result.message,
      data: null,
    });
  }),

  resetPassword: catchAsync(async (req, res) => {
    const result = await AuthService.resetPassword(req.body);

    sendResponse(res, {
      statusCode: status.OK,
      message: "Password Successfully Reset!",
      data: result,
    });
  }),

  // change password
  changePassword: catchAsync(async (req: Request, res) => {
    const userId = req.user.id;

    const result = await AuthService.changePassword({ ...req.body, userId });

    sendResponse(res, {
      statusCode: status.OK,
      message: "User password changed successfully!",
      data: result,
    });
  }),

  refreshToken: catchAsync(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    const result = await AuthService.refreshToken(refreshToken);

    setCookie({
      res,
      cookieName: COOKIE_NAME.REFRESH_TOKEN,
      token: result.refreshToken,
    });

    sendResponse(res, {
      statusCode: status.OK,
      message: "Access token is retrieved successfully!",
      data: result,
    });
  }),
};

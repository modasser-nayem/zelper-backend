import { emailVerification } from "./../../../mail/template/emailVerification";
import status from "http-status";
import { OAuth2Client } from "google-auth-library";
import { sendEmail } from "../../../mail/sendEmail";
import AppError from "../../../errors/AppError";
import { resetPasswordHtml } from "../../../mail/template/resetPassword";
import config from "../../../config";
import { generateOtp } from "./auth.utils";
import prisma from "../../../db/prisma";
import {
  TChangePassword,
  TLogin,
  TResetPassword,
  TSendOtp,
  TSignupUser,
  TVerifyOtp,
} from "./auth.interface";
import { PasswordHelper } from "../../../helpers/password";
import JwtHelper from "../../../helpers/jwtHelpers";
import { NotificationService } from "../Notification/notification.service";

export class AuthService {
  // Create Account
  static createAccount = async (payload: { data: TSignupUser }) => {
    const { data } = payload;
    data.email = data.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new AppError(
        status.CONFLICT,
        "User already exists with this email!",
      );
    }

    // Hash password
    data.password = await PasswordHelper.hashedPassword(data.password);

    const { fcmToken, ...restData } = payload.data;

    // Create user
    const result = await prisma.user.create({
      data: { ...restData },
    });

    if (payload.data.fcmToken) {
      await NotificationService.addFcmToken({
        userId: result.id,
        token: payload.data.fcmToken,
      });
    }

    return this.getLoginTokens({ id: result.id, role: result.role });
  };

  //  Login User
  static loginUser = async (payload: TLogin) => {
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found!");
    }

    // Check user status
    if (user.status === "BLOCKED") {
      throw new AppError(
        status.FORBIDDEN,
        "Your account has been blocked. Please contact support.",
      );
    }

    // Check if password exists (OAuth users don't have passwords)
    if (!user.password) {
      throw new AppError(
        status.BAD_REQUEST,
        `This account is linked with ${user.auth_provider}. Please use ${user.auth_provider} login.`,
      );
    }

    const isPasswordMatched = await PasswordHelper.isPasswordMatch(
      payload.password,
      user.password as string,
    );

    if (!isPasswordMatched) {
      throw new AppError(status.UNAUTHORIZED, "Password is incorrect!");
    }

    if (payload.fcmToken) {
      await NotificationService.addFcmToken({
        userId: user.id,
        token: payload.fcmToken,
      });
    }

    return this.getLoginTokens({ id: user.id, role: user.role });
  };

  // Social Login
  static socialLogin = async (payload: {
    provider: "GOOGLE";
    token: string;
    fcmToken?: string;
  }) => {
    const { provider, token, fcmToken } = payload;

    if (provider !== "GOOGLE") {
      throw new AppError(status.BAD_REQUEST, "Only Google login is supported");
    }

    const userInfo = await this.verifyGoogleToken(token);

    if (!userInfo?.email) {
      throw new AppError(status.BAD_REQUEST, "Email not found from Google");
    }

    const email = userInfo.email;
    const name = userInfo.name || "";
    const avatar = userInfo.picture || "";

    // Check existing user first
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Prevent provider conflict
      if (user.auth_provider && user.auth_provider !== "GOOGLE") {
        throw new AppError(
          status.BAD_REQUEST,
          "This email is already registered with another method",
        );
      }

      // Update user info
      user = await prisma.user.update({
        where: { email },
        data: {
          name,
          avatar,
          auth_provider: "GOOGLE",
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar,
          password: "",
          auth_provider: "GOOGLE",
        },
      });
    }

    // Save FCM token
    if (fcmToken) {
      await NotificationService.addFcmToken({
        userId: user.id,
        token: fcmToken,
      });
    }

    return this.getLoginTokens({
      id: user.id,
      role: user.role,
    });
  };

  // Forgot Password
  static forgotPassword = async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found!");
    }

    if (user.status === "BLOCKED") {
      throw new AppError(
        status.FORBIDDEN,
        "Account has been blocked! contact support.",
      );
    }

    const { otp, expiresAt, expireMinute } = generateOtp();

    await prisma.otp.create({
      data: {
        code: otp,
        type: "FORGOT_PASSWORD",
        email: normalizedEmail,
        expires_at: expiresAt,
      },
    });

    await sendEmail({
      to: email,
      subject: "Reset Your Password",
      html: resetPasswordHtml({
        otp,
        userName: user.name,
        expireMinute,
      }),
    });

    return { expiresAt, expireMinute };
  };

  // Reset Password
  static resetPassword = async (payload: TResetPassword) => {
    const normalizedEmail = payload.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found!");
    }

    // Check user status
    if (user.status === "BLOCKED") {
      throw new AppError(
        status.FORBIDDEN,
        "Your account has been blocked. Please contact support.",
      );
    }

    // Check if OTP was verified
    const verifiedOtp = await prisma.otp.findFirst({
      where: {
        email: normalizedEmail,
        is_verified: true,
        type: "FORGOT_PASSWORD",
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (!verifiedOtp) {
      throw new AppError(status.BAD_REQUEST, "Please verify OTP first!");
    }

    if (verifiedOtp.is_used) {
      throw new AppError(
        status.BAD_REQUEST,
        "OTP already used, please request for a new OTP",
      );
    }

    // check verified expire
    if (verifiedOtp.verified_at) {
      this.verifiedOtpExpire(verifiedOtp.verified_at);
    }

    payload.newPassword = await PasswordHelper.hashedPassword(
      payload.newPassword,
    );

    await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        password: payload.newPassword,
      },
    });

    // Mark the OTP as used to prevent reuse
    await prisma.otp.updateMany({
      where: {
        id: verifiedOtp.id,
      },
      data: {
        is_used: true,
      },
    });

    return null;
  };

  // refreshToken
  static refreshToken = async (token?: string) => {
    if (!token) {
      throw new AppError(status.UNAUTHORIZED, "You are not authorized");
    }

    const decoded = JwtHelper.verifyToken(token, "REFRESH_TOKEN");

    if (!decoded) {
      throw new AppError(status.UNAUTHORIZED, "Invalid access token");
    }

    const { id } = decoded;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found");
    }

    return this.getLoginTokens({ id: user.id, role: user.role });
  };

  // change password
  static changePassword = async (payload: TChangePassword) => {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found!");
    }

    if (user.status === "BLOCKED") {
      throw new AppError(
        status.FORBIDDEN,
        "Account has been blocked! contact support session",
      );
    }

    const isPasswordMatch = await PasswordHelper.isPasswordMatch(
      payload.currentPassword,
      user.password as string,
    );

    if (!isPasswordMatch) {
      throw new AppError(status.BAD_REQUEST, "Current password is incorrect!");
    }

    if (payload.currentPassword === payload.newPassword) {
      throw new AppError(
        status.BAD_REQUEST,
        "Can't used new password as current password",
      );
    }

    payload.newPassword = await PasswordHelper.hashedPassword(
      payload.newPassword,
    );

    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        password: payload.newPassword,
      },
    });

    return null;
  };

  // verify OTP
  static async verifyOTP(payload: { email: string; otp: number }) {
    const maxAttempts = 3;

    const otpData = await prisma.otp.findFirst({
      where: {
        email: payload.email,
        is_verified: false,
        is_used: false,
      },
      orderBy: { created_at: "desc" },
    });

    if (!otpData) {
      throw new AppError(
        status.BAD_REQUEST,
        "OTP not found or has expired. Please request a new OTP.",
      );
    }

    if (otpData.attempts >= maxAttempts) {
      throw new AppError(
        status.BAD_REQUEST,
        "Maximum OTP attempts exceeded. Please request a new OTP.",
      );
    }

    // Check expiration
    const currentTime = new Date();
    if (currentTime > otpData.expires_at) {
      throw new AppError(
        status.BAD_REQUEST,
        "OTP has expired. Please request a new OTP.",
      );
    }

    // If OTP does not match, increment attempts
    if (otpData.code !== payload.otp) {
      if (otpData.attempts + 1 >= maxAttempts) {
        await prisma.otp.update({
          where: { id: otpData.id },
          data: {
            attempts: otpData.attempts + 1,
          },
        });

        throw new AppError(
          status.BAD_REQUEST,
          "Maximum OTP attempts exceeded. Please request a new OTP.",
        );
      }

      await prisma.otp.update({
        where: { id: otpData.id },
        data: { attempts: otpData.attempts + 1 },
      });

      throw new AppError(
        status.BAD_REQUEST,
        `Invalid OTP. You have ${
          maxAttempts - (otpData.attempts + 1)
        } attempts left.`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      return await tx.otp.update({
        where: { id: otpData.id },
        data: {
          is_verified: true,
          verified_at: new Date(),
          attempts: otpData.attempts + 1,
        },
      });
    });

    return {
      isVerified: true,
      message: "OTP successfully verified",
      email: payload.email,
      optId: result.id,
    };
  }

  // Check if the verified OTP is still recent (10 min window)
  private static verifiedOtpExpire(verifiedAt: Date) {
    const minute = 10;
    const fifteenMinutesAgo = new Date(Date.now() - Number(minute) * 60 * 1000);

    if (verifiedAt < fifteenMinutesAgo) {
      throw new AppError(
        status.BAD_REQUEST,
        "OTP verification expired. Please request a new OTP.",
      );
    }
  }

  // verify google token
  private static verifyGoogleToken = async (idToken: string) => {
    const client = new OAuth2Client(config.oauth.google.GOOGLE_CLIENT_ID);
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const response = ticket.getPayload();

      if (!response) {
        throw new AppError(status.NOT_FOUND, "Empty Google token payload");
      }

      console.log("Google verify: ", response);

      return response;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Google OAuth error:", error?.message);

      if (error?.message?.includes("Wrong number of segments")) {
        throw new AppError(status.BAD_REQUEST, "Malformed Google token");
      }

      if (error?.message?.includes("Token used too late")) {
        throw new AppError(status.BAD_REQUEST, "Google token expired");
      }

      throw new AppError(
        status.INTERNAL_SERVER_ERROR,
        "Google authentication failed",
      );
    }
  };

  private static getLoginTokens(payload: { id: string; role: string }) {
    return {
      accessToken: JwtHelper.generateToken(payload, "ACCESS_TOKEN"),
      refreshToken: JwtHelper.generateToken(payload, "REFRESH_TOKEN"),
    };
  }
}

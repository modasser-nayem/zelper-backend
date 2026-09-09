import { emailVerification } from "./../../../mail/template/emailVerification";
import status from "http-status";
import axios from "axios";
import admin from "../../../helpers/firebaseAdmin";
import { sendEmail } from "../../../mail/sendEmail";
import AppError from "../../../errors/AppError";
import { resetPasswordHtml } from "../../../mail/template/resetPassword";
import config from "../../../config";
import { generateOtp } from "./auth.utils";
import prisma from "../../../db/prisma";
import { Prisma } from "@prisma/client";
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

    // Format expertise
    let dbExpertise: string[] = [];
    if (restData.expertise) {
      if (Array.isArray(restData.expertise)) {
        dbExpertise = restData.expertise;
      } else if (typeof restData.expertise === "string") {
        dbExpertise = restData.expertise
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
      }
    }

    // Create user with direct fields matching schema.prisma
    const result = await prisma.user.create({
      data: {
        name: restData.name,
        email: restData.email,
        password: restData.password,
        role: "USER",
        phone: restData.phone || null,
        bio: restData.bio || null,
        latitude: restData.latitude || null,
        longitude: restData.longitude || null,
        service_radius: restData.service_radius || 0,
        expertise: dbExpertise,
      },
    });

    if (payload.data.fcmToken) {
      await NotificationService.addFcmToken({
        userId: result.id,
        token: payload.data.fcmToken,
      });
    }

    return this.getLoginTokens(result);
  };

  //  Login User
  static loginUser = async (payload: TLogin) => {
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found!");
    }

    if (user.status !== "ACTIVE") {
      throw new AppError(
        status.FORBIDDEN,
        `Your account status is ${user.status.toLowerCase()}. Please contact support.`,
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

    return this.getLoginTokens(user);
  };

  // Social Login (Firebase Auth)
  static socialLogin = async (payload: {
    provider: string;
    token: string;
    fcmToken?: string;
  }) => {
    const { token, fcmToken } = payload;

    const userInfo = await this.verifyFirebaseToken(token);

    if (!userInfo?.email) {
      throw new AppError(status.BAD_REQUEST, "Email not found from Firebase");
    }

    const email = userInfo.email.toLowerCase().trim();
    const name = userInfo.name || email.split("@")[0];
    const avatar = userInfo.picture || "";

    // Check existing user first
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Update user info
      user = await prisma.user.update({
        where: { email },
        data: {
          name: user.name || name,
          avatar: user.avatar || avatar,
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

    return this.getLoginTokens(user);
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

    if (user.status !== "ACTIVE") {
      throw new AppError(
        status.FORBIDDEN,
        `Your account status is ${user.status.toLowerCase()}. Please contact support.`,
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
    if (user.status !== "ACTIVE") {
      throw new AppError(
        status.FORBIDDEN,
        `Your account status is ${user.status.toLowerCase()}. Please contact support.`,
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

    return this.getLoginTokens(user);
  };

  // change password
  static changePassword = async (payload: TChangePassword) => {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new AppError(status.NOT_FOUND, "User not found!");
    }

    if (user.status !== "ACTIVE") {
      throw new AppError(
        status.FORBIDDEN,
        `Your account status is ${user.status.toLowerCase()}. Please contact support.`,
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

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        return await tx.otp.update({
          where: { id: otpData.id },
          data: {
            is_verified: true,
            verified_at: new Date(),
            attempts: otpData.attempts + 1,
          },
        });
      },
    );

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

  // verify firebase id token
  private static verifyFirebaseToken = async (idToken: string) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      if (!decodedToken || !decodedToken.email) {
        throw new AppError(status.BAD_REQUEST, "Email not found in Firebase token");
      }

      console.log("🔥 Firebase Auth verifyIdToken success for:", decodedToken.email);

      return {
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split("@")[0],
        picture: decodedToken.picture || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Firebase Auth verification error:", error?.message);

      if (error?.code === "auth/id-token-expired") {
        throw new AppError(status.UNAUTHORIZED, "Firebase token expired");
      }

      if (
        error?.code === "auth/argument-error" ||
        error?.message?.includes("Decoding Firebase ID token failed") ||
        error?.message?.includes("Wrong number of segments")
      ) {
        throw new AppError(status.BAD_REQUEST, "Malformed or invalid Firebase token");
      }

      throw new AppError(
        status.UNAUTHORIZED,
        error?.message || "Firebase authentication failed",
      );
    }
  };

  private static getLoginTokens(user: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    role: string;
    status: string;
    auth_provider: string;
    created_at: Date;
    updated_at: Date;
  }) {
    const tokenPayload = { id: user.id, role: user.role };
    const userInfo = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      role: user.role,
      status: user.status,
      auth_provider: user.auth_provider,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    return {
      accessToken: JwtHelper.generateToken(tokenPayload, "ACCESS_TOKEN"),
      refreshToken: JwtHelper.generateToken(tokenPayload, "REFRESH_TOKEN"),
      user: userInfo,
    };
  }
}

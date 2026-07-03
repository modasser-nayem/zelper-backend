import { IUserFilterRequest, TUpdateUser } from "./user.interface";
import {
  IPaginationOptions,
  PaginationHelper,
} from "../../../helpers/pagination";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import httpStatus from "http-status";
import AppError from "../../../errors/AppError";
import prisma from "../../../db/prisma";
import { FileUploadHelper } from "../../../upload/fileUpload";
import JwtHelper from "../../../helpers/jwtHelpers";

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  status: true,
  role: true,
  auth_provider: true,
  created_at: true,
  updated_at: true,
  provider_profile: {
    select: {
      id: true,
      phone: true,
      bio: true,
      latitude: true,
      longitude: true,
      experience_years: true,
      rating_average: true,
      total_reviews: true,
      verification_status: true,
      documents: true,
      rejection_reason: true,
      expertise: true,
    },
  },
};

export const UserService = {
  // get user profile
  getMyProfile: async (userId: string) => {
    const userInfo = await prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect,
    });

    if (!userInfo) throw new AppError(httpStatus.NOT_FOUND, "User not Found!");

    return userInfo;
  },

  // Update own profile
  updateProfile: async (payload: { userId: string; data: TUpdateUser }) => {
    const { userId, data } = payload;
    if (data.email) data.email = data.email.toLocaleLowerCase().trim();

    const userInfo = await prisma.user.findUnique({ where: { id: userId } });

    if (!userInfo) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    // check already other use this email
    if (data.email) {
      const existEmail = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: userInfo.id } },
      });
      if (existEmail) {
        throw new AppError(httpStatus.BAD_REQUEST, "Try another email address");
      }
    }

    const result = await prisma.user.update({
      where: { id: userInfo.id },
      data: { name: data.name, email: data.email },
      select: userPublicSelect,
    });

    return result;
  },

  // Update profile picture
  updateProfilePicture: async (payload: {
    userId: string;
    file: Express.Multer.File;
  }) => {
    const { userId, file } = payload;

    if (!file) throw new AppError(httpStatus.BAD_REQUEST, "No image provided");

    const userInfo = await prisma.user.findUnique({ where: { id: userId } });

    if (!userInfo) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    const oldPictureUrl = userInfo.avatar;
    const imageUrl = (await FileUploadHelper.uploadSingle(file, "file")).url;

    const result = await prisma.user.update({
      where: { id: userInfo.id },
      data: { avatar: imageUrl },
      select: userPublicSelect,
    });

    if (oldPictureUrl) {
      try {
        await FileUploadHelper.deleteSingle(oldPictureUrl);
      } catch (error) {
        console.error("Failed to delete old avatar image:", error);
      }
    }

    return result;
  },

  // Get All Users
  getAllUsers: async (payload: {
    filters: IUserFilterRequest;
    options: IPaginationOptions;
  }) => {
    const { page, limit, skip, sortBy, sortOrder } =
      PaginationHelper.calculatePagination(payload.options);
    const { searchTerm, role, status: userStatus } = payload.filters;

    const andConditions: Prisma.UserWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: ["name", "email"].map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (
      typeof role === "string" &&
      Object.values(UserRole).includes(role as UserRole)
    ) {
      andConditions.push({ role: role as UserRole });
    }

    if (
      typeof userStatus === "string" &&
      Object.values(UserStatus).includes(userStatus as UserStatus)
    ) {
      andConditions.push({ status: userStatus as UserStatus });
    }

    const whereConditions: Prisma.UserWhereInput = { AND: andConditions };

    const result = await prisma.user.findMany({
      where: whereConditions,
      skip,
      select: userPublicSelect,
      orderBy:
        sortBy && sortOrder
          ? { [sortBy]: sortOrder }
          : { created_at: "desc" },
    });

    const total = await prisma.user.count({ where: whereConditions });

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: result,
    };
  },

  // Get Single User
  getSingleUser: async (id: string) => {
    const result = await prisma.user.findUnique({
      where: { id },
      select: userPublicSelect,
    });

    if (!result) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }
    return result;
  },

  // Toggle user status ACTIVE <-> SUSPENDED
  updateUserStatus: async (id: string) => {
    const userInfo = await prisma.user.findUnique({ where: { id } });

    if (!userInfo) throw new AppError(httpStatus.NOT_FOUND, "User not found!");

    const newStatus = userInfo.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";

    const result = await prisma.user.update({
      where: { id: userInfo.id },
      data: { status: newStatus },
      select: userPublicSelect,
    });

    if (!result)
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to update user status",
      );

    return result;
  },

  // Delete User
  deleteAccount: async (id: string) => {
    const userInfo = await prisma.user.findUnique({ where: { id } });

    if (!userInfo) throw new AppError(httpStatus.NOT_FOUND, "User not found!");

    await prisma.user.delete({ where: { id: userInfo.id } });

    return null;
  },

  // Request provider verification (upload documents)
  requestProviderVerification: async (payload: {
    userId: string;
    files: Express.Multer.File[];
  }) => {
    const { userId, files } = payload;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found!");
    }

    if (!files || files.length === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "At least one document is required for verification!",
      );
    }

    const uploadResults = await FileUploadHelper.uploadMultiple(files, "document");
    const documents = uploadResults.map((res) => res.url);

    // Upsert ProviderProfile
    const profile = await prisma.providerProfile.upsert({
      where: { user_id: userId },
      update: {
        verification_status: "IN_REVIEW",
        documents,
        rejection_reason: null,
      },
      create: {
        user_id: userId,
        verification_status: "IN_REVIEW",
        documents,
      },
    });

    return profile;
  },

  // Update provider verification status (Admin)
  updateProviderStatus: async (payload: {
    id: string;
    status: "VERIFIED" | "REJECTED";
    rejectionReason?: string;
  }) => {
    const { id, status: newStatus, rejectionReason } = payload;

    const profile = await prisma.providerProfile.findUnique({
      where: { user_id: id },
    });

    if (!profile) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "Provider profile not found! User has not submitted verification request.",
      );
    }

    if (newStatus === "REJECTED" && !rejectionReason) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Rejection reason is required when rejecting a provider!",
      );
    }

    const updateData: Prisma.ProviderProfileUpdateInput = {
      verification_status: newStatus,
    };

    if (newStatus === "REJECTED") {
      updateData.rejection_reason = rejectionReason;
    } else if (newStatus === "VERIFIED") {
      updateData.rejection_reason = null;
    }

    const result = await prisma.providerProfile.update({
      where: { user_id: id },
      data: updateData,
    });

    return result;
  },

  // Switch role between CUSTOMER and PROVIDER
  switchRole: async (payload: {
    userId: string;
    role: "CUSTOMER" | "PROVIDER";
  }) => {
    const { userId, role } = payload;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { provider_profile: true },
    });

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found!");
    }

    // Must be VERIFIED to switch to provider
    if (role === "PROVIDER") {
      if (!user.provider_profile) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "You must set up a provider profile and get verified by admin before switching to provider role!",
        );
      }
      if (user.provider_profile.verification_status !== "VERIFIED") {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Your provider profile must be verified by admin before switching to provider role!",
        );
      }
    }

    const result = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    const tokens = {
      accessToken: JwtHelper.generateToken(
        { id: result.id, role: result.role },
        "ACCESS_TOKEN",
      ),
      refreshToken: JwtHelper.generateToken(
        { id: result.id, role: result.role },
        "REFRESH_TOKEN",
      ),
    };

    const { password, ...userData } = result;

    return {
      user: userData,
      ...tokens,
    };
  },
};

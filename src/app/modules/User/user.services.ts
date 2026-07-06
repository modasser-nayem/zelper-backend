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
import { NotificationService } from "../Notification/notification.service";

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  status: true,
  role: true,
  auth_provider: true,
  phone: true,
  bio: true,
  latitude: true,
  longitude: true,
  service_radius: true,
  rating_average: true,
  total_reviews: true,
  completed_jobs: true,
  verification_status: true,
  rejection_reason: true,
  expertise: true,
  verification_document: {
    select: {
      id: true,
      document_type: true,
      document_url: true,
      created_at: true,
    },
  },
  created_at: true,
  updated_at: true,
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
  updateProfile: async (payload: {
    userId: string;
    data: TUpdateUser;
    file?: Express.Multer.File;
  }) => {
    const { userId, data, file } = payload;
    if (data.email) data.email = data.email.toLowerCase().trim();

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

    // Format expertise if passed
    let dbExpertise: string[] | undefined = undefined;
    if (data.expertise !== undefined) {
      if (Array.isArray(data.expertise)) {
        dbExpertise = data.expertise;
      } else if (typeof data.expertise === "string") {
        dbExpertise = data.expertise
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
      }
    }

    // Upload avatar if file is provided
    let avatarUrl: string | undefined = undefined;
    if (file) {
      avatarUrl = (await FileUploadHelper.uploadSingle(file, "file")).url;
    }

    const result = await prisma.user.update({
      where: { id: userInfo.id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        bio: data.bio,
        latitude: data.latitude,
        longitude: data.longitude,
        service_radius: data.service_radius,
        expertise: dbExpertise,
        avatar: avatarUrl,
      },
      select: userPublicSelect,
    });

    // Clean up old avatar if updated successfully
    if (file && userInfo.avatar) {
      try {
        await FileUploadHelper.deleteSingle(userInfo.avatar);
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
      take: limit,
      select: userPublicSelect,
      orderBy:
        sortBy && sortOrder ? { [sortBy]: sortOrder } : { created_at: "desc" },
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

  // Request helper verification (upload a document)
  requestHelperVerification: async (payload: {
    userId: string;
    file: Express.Multer.File;
    documentType: string;
  }) => {
    const { userId, file, documentType } = payload;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found!");
    }

    if (!file) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "A document file is required!",
      );
    }

    if (!documentType || typeof documentType !== "string" || !documentType.trim()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "documentType is required!",
      );
    }

    const docTypeTrimmed = documentType.trim();

    const uploadResult = await FileUploadHelper.uploadSingle(file, "document");

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Delete existing document of the same type for this user
        await tx.verificationDocument.deleteMany({
          where: {
            user_id: userId,
            document_type: docTypeTrimmed,
          },
        });

        // Insert new document
        await tx.verificationDocument.create({
          data: {
            user_id: userId,
            document_type: docTypeTrimmed,
            document_url: uploadResult.url,
          },
        });

        // Update user verification status to IN_REVIEW
        return await tx.user.update({
          where: { id: userId },
          data: {
            verification_status: "IN_REVIEW",
            rejection_reason: null,
          },
          select: userPublicSelect,
        });
      },
    );

    return result;
  },

  // Update helper verification status (Admin)
  updateHelperStatus: async (payload: {
    id: string;
    status: "VERIFIED" | "REJECTED";
    rejectionReason?: string;
  }) => {
    const { id, status: newStatus, rejectionReason } = payload;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found!");
    }

    if (newStatus === "REJECTED" && !rejectionReason) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Rejection reason is required when rejecting a helper!",
      );
    }

    const updateData: Prisma.UserUpdateInput = {
      verification_status: newStatus,
    };

    if (newStatus === "REJECTED") {
      updateData.rejection_reason = rejectionReason;
    } else if (newStatus === "VERIFIED") {
      updateData.rejection_reason = null;
    }

    const result = await prisma.user.update({
      where: { id },
      data: updateData,
      select: userPublicSelect,
    });

    if (newStatus === "VERIFIED") {
      await NotificationService.createNotification({
        receiverId: id,
        title: "Account Verified",
        content: "Congratulations! Your helper account has been successfully verified.",
        data: { userId: id, status: newStatus },
      });
    } else if (newStatus === "REJECTED") {
      await NotificationService.createNotification({
        receiverId: id,
        title: "Verification Rejected",
        content: `Your helper verification has been rejected. Reason: ${rejectionReason}`,
        data: { userId: id, status: newStatus, reason: rejectionReason },
      });
    }

    return result;
  },
};

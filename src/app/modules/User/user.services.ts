import { IUserFilterRequest, TUpdateUser } from "./user.interface";
import {
  IPaginationOptions,
  PaginationHelper,
} from "../../../helpers/pagination";
import { Prisma, ServiceHelperStatus, UserRole, UserStatus } from "@prisma/client";
import httpStatus from "http-status";
import AppError from "../../../errors/AppError";
import prisma from "../../../db/prisma";
import { FileUploadHelper } from "../../../upload/fileUpload";
import { NotificationService } from "../Notification/notification.service";
import { NotificationType } from "../Notification/notification.interface";

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
    const { searchTerm, role, status: userStatus, verification_status } = payload.filters;

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

    if (
      typeof verification_status === "string" &&
      Object.values(ServiceHelperStatus).includes(
        verification_status.toUpperCase() as ServiceHelperStatus,
      )
    ) {
      andConditions.push({
        verification_status: verification_status.toUpperCase() as ServiceHelperStatus,
      });
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

  // Request helper verification (Supports array of files, replace, upload new & delete)
  requestHelperVerification: async (payload: {
    userId: string;
    files: Express.Multer.File[];
    body: any;
  }) => {
    const { userId, files = [], body = {} } = payload;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { verification_document: true },
    });

    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, "User not found!");
    }

    // Helper to safely delete file from AWS S3
    const safeDeleteFromAWS = async (fileUrl: string) => {
      if (!fileUrl) return;
      try {
        await FileUploadHelper.deleteSingle(fileUrl);
      } catch (err) {
        console.error("Failed to delete file from AWS S3:", fileUrl, err);
      }
    };

    // 1. Parse deleteDocumentIds (Array of string document IDs)
    let deleteIds: string[] = [];
    if (body.deleteDocumentIds) {
      if (Array.isArray(body.deleteDocumentIds)) {
        deleteIds = body.deleteDocumentIds.map(String);
      } else if (typeof body.deleteDocumentIds === "string") {
        try {
          const parsed = JSON.parse(body.deleteDocumentIds);
          if (Array.isArray(parsed)) deleteIds = parsed.map(String);
        } catch {
          // ignore invalid json string
        }
      }
    }

    // Process document deletions: Remove from AWS S3 & DB
    for (const docId of deleteIds) {
      const docToDelete = await prisma.verificationDocument.findFirst({
        where: { id: docId, user_id: userId },
      });
      if (docToDelete) {
        await safeDeleteFromAWS(docToDelete.document_url);
        await prisma.verificationDocument.delete({
          where: { id: docToDelete.id },
        });
      }
    }

    // 2. Parse documents metadata array: [{ documentType: string, documentId?: string }]
    let documentsMeta: Array<{ documentType: string; documentId?: string }> = [];

    if (body.documents) {
      if (Array.isArray(body.documents)) {
        documentsMeta = body.documents;
      } else if (typeof body.documents === "string") {
        try {
          const parsed = JSON.parse(body.documents);
          if (Array.isArray(parsed)) documentsMeta = parsed;
        } catch {
          // ignore invalid json string
        }
      }
    }

    // Validation: ensure at least files uploaded or document deletions performed
    if (files.length === 0 && deleteIds.length === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "No document files uploaded or delete IDs provided!",
      );
    }

    // 3. Process new file uploads & replacements
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = documentsMeta[i] || {
        documentType: `DOCUMENT_${i + 1}`,
      };
      const docType = meta.documentType
        ? meta.documentType.trim()
        : `DOCUMENT_${i + 1}`;
      const docIdToReplace = meta.documentId;

      // Upload new file to AWS S3
      const uploadResult = await FileUploadHelper.uploadSingle(file, "document");

      if (docIdToReplace) {
        // REPLACE BY DOCUMENT ID: Delete old S3 file & update DB record
        const existingDoc = await prisma.verificationDocument.findFirst({
          where: { id: docIdToReplace, user_id: userId },
        });

        if (existingDoc) {
          await safeDeleteFromAWS(existingDoc.document_url);
          await prisma.verificationDocument.update({
            where: { id: existingDoc.id },
            data: {
              document_type: docType,
              document_url: uploadResult.url,
            },
          });
        } else {
          // Specified ID not found, create new record
          await prisma.verificationDocument.create({
            data: {
              user_id: userId,
              document_type: docType,
              document_url: uploadResult.url,
            },
          });
        }
      } else {
        // Create brand new document record
        await prisma.verificationDocument.create({
          data: {
            user_id: userId,
            document_type: docType,
            document_url: uploadResult.url,
          },
        });
      }
    }

    // 4. Update user verification status based on remaining documents
    const remainingDocsCount = await prisma.verificationDocument.count({
      where: { user_id: userId },
    });

    const newStatus = remainingDocsCount > 0 ? "IN_REVIEW" : "NOT_SUBMITTED";

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        verification_status: newStatus,
        rejection_reason: null,
      },
      select: userPublicSelect,
    });

    return updatedUser;
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
        type: NotificationType.ACCOUNT_VERIFIED,
        title: "Account Verified",
        content:
          "Congratulations! Your helper account has been successfully verified.",
        data: { userId: id, status: newStatus },
      });
    } else if (newStatus === "REJECTED") {
      await NotificationService.createNotification({
        receiverId: id,
        type: NotificationType.VERIFICATION_REJECTED,
        title: "Verification Rejected",
        content: `Your helper verification has been rejected. Reason: ${rejectionReason}`,
        data: { userId: id, status: newStatus, reason: rejectionReason },
      });
    }

    return result;
  },
};

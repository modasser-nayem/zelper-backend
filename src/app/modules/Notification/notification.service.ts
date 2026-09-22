import { Prisma } from "@prisma/client";
import prisma from "../../../db/prisma";
import { PaginationHelper } from "../../../helpers/pagination";
import logger from "../../../utils/logger";
import { NotificationType } from "./notification.interface";
import { notificationQueue } from "./notification.queue";

export const NotificationService = {
  // save fcm token
  addFcmToken: async (payload: { userId: string; token: string }) => {
    const { userId, token } = payload;
    if (!token) {
      return { success: false, message: "FCM Token is required" };
    }

    logger.info(`FCM Token received for user ${userId}: ${token}`);

    await prisma.userDeviceToken.upsert({
      where: { fcm_token: token },
      create: {
        user_id: userId,
        fcm_token: token,
      },
      update: {
        user_id: userId,
        updated_at: new Date(),
      },
    });

    return { success: true, message: "FCM Token registered successfully!" };
  },

  // remove fcm token for this specific device
  removeFcmToken: async (payload: { userId: string; token?: string }) => {
    const { userId, token } = payload;

    if (!token) {
      return { success: false, message: "Device FCM token is required to remove" };
    }

    await prisma.userDeviceToken.deleteMany({
      where: {
        user_id: userId,
        fcm_token: token,
      },
    });

    return { success: true, message: "Device FCM Token removed successfully!" };
  },

  // create and send notification (DB + real-time Socket via Background Queue)
  createNotification: async (payload: {
    receiverId: string;
    type: NotificationType;
    title: string;
    content: string;
    data?: Record<string, unknown> | null;
  }) => {
    const { receiverId, type, title, content, data } = payload;

    // Enqueue the notification job to be executed asynchronously
    notificationQueue.add({
      receiverId,
      type,
      title,
      content,
      data,
    });

    // Return immediately to avoid blocking the caller
    return { queued: true };
  },

  // get my notifications (paginated)
  getMyNotifications: async (payload: {
    userId: string;
    query: { page?: string; limit?: string };
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { receiver_id: userId },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.notification.count({
        where: { receiver_id: userId },
      }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: notifications,
    };
  },

  // mark a single notification as read
  markAsRead: async (payload: { userId: string; notificationId: string }) => {
    const { userId, notificationId } = payload;

    const notification = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        receiver_id: userId,
      },
      data: { is_read: true },
    });

    return { success: true };
  },

  // mark all notifications as read
  markAllAsRead: async (userId: string) => {
    await prisma.notification.updateMany({
      where: {
        receiver_id: userId,
        is_read: false,
      },
      data: { is_read: true },
    });

    return { success: true };
  },
};

import { Prisma } from "@prisma/client";
import prisma from "../../../db/prisma";
import { PaginationHelper } from "../../../helpers/pagination";
import { getIo } from "../../../socket/socketHandler";
import logger from "../../../utils/logger";

export const NotificationService = {
  // save fcm token
  addFcmToken: async (payload: { userId: string; token: string }) => {
    logger.info(`FCM Token received for user ${payload.userId}: ${payload.token}`);
    return { success: true };
  },

  // create and send notification (DB + real-time Socket)
  createNotification: async (payload: {
    receiverId: string;
    title: string;
    content: string;
    data?: Record<string, unknown> | null;
  }) => {
    const { receiverId, title, content, data } = payload;

    const notification = await prisma.notification.create({
      data: {
        receiver_id: receiverId,
        title,
        content,
        data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    try {
      const io = getIo();
      io.to(`user:${receiverId}`).emit("notification_received", notification);
    } catch {
      // safe fallback if socket server not fully initialized or ready
    }

    return notification;
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

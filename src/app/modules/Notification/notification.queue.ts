import logger from "../../../utils/logger";
import prisma from "../../../db/prisma";
import { getIo } from "../../../socket/socketHandler";
import { Prisma } from "@prisma/client";
import { NotificationType } from "./notification.interface";
import { SOCKET_EVENTS } from "../../../socket/socket.constant";

type TNotificationJob = {
  receiverId: string;
  type: NotificationType;
  title: string;
  content: string;
  data?: Record<string, unknown> | null;
};

class NotificationQueue {
  private queue: TNotificationJob[] = [];
  private isProcessing = false;

  public add(job: TNotificationJob) {
    this.queue.push(job);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;

      try {
        await this.executeJob(job);
      } catch (error) {
        logger.error(
          `Failed to process notification job for receiver ${job.receiverId} (Type: ${job.type}):`,
          error,
        );
      }
    }

    this.isProcessing = false;
  }

  private async executeJob(job: TNotificationJob) {
    logger.info(
      `Executing background notification job for receiver ${job.receiverId} (Type: ${job.type})`,
    );

    // 1. Create notification in database
    const notification = await prisma.notification.create({
      data: {
        receiver_id: job.receiverId,
        type: job.type,
        title: job.title,
        content: job.content,
        data: job.data ? (job.data as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // 2. Emit real-time notification to the user's socket room
    try {
      const io = getIo();
      io.to(`user:${job.receiverId}`).emit(
        SOCKET_EVENTS.NOTIFICATION_RECEIVED,
        notification,
      );
      logger.info(
        `Successfully sent real-time notification to user:${job.receiverId} (Type: ${job.type})`,
      );
    } catch (err) {
      logger.warn(
        `Failed to emit real-time socket notification to user:${job.receiverId}: Socket server not initialized.`,
      );
    }
  }
}

export const notificationQueue = new NotificationQueue();

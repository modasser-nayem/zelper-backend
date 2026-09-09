import admin from "./firebaseAdmin";
import prisma from "../db/prisma";
import logger from "../utils/logger";

interface SendFcmPushOptions {
  receiverId: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}

export async function sendFcmPushNotification({
  receiverId,
  title,
  body,
  data,
}: SendFcmPushOptions): Promise<void> {
  try {
    // 1. Fetch active FCM tokens for the receiver
    const deviceTokens = await prisma.userDeviceToken.findMany({
      where: { user_id: receiverId },
      select: { fcm_token: true },
    });

    if (!deviceTokens || deviceTokens.length === 0) {
      logger.info(`ℹ️ No FCM tokens found for user ${receiverId}. Skipping Web Push.`);
      return;
    }

    const tokens = deviceTokens.map((dt) => dt.fcm_token);

    // 2. Format string-only data payload for Firebase Cloud Messaging
    const stringDataPayload: Record<string, string> = {};
    if (data) {
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          stringDataPayload[key] = typeof val === "object" ? JSON.stringify(val) : String(val);
        }
      });
    }

    // 3. Build Multicast Message payload
    const multicastMessage: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body,
      },
      data: stringDataPayload,
      webpush: {
        notification: {
          title,
          body,
          icon: "/favicon.ico",
        },
        fcmOptions: {
          link: stringDataPayload.link || stringDataPayload.url || "/",
        },
      },
    };

    // 4. Send FCM Push Notification
    const response = await admin.messaging().sendEachForMulticast(multicastMessage);
    logger.info(
      `📲 Sent FCM Web Push for user ${receiverId}: ${response.successCount} succeeded, ${response.failureCount} failed.`,
    );

    // 5. Clean up expired / invalid tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await prisma.userDeviceToken.deleteMany({
          where: { fcm_token: { in: tokensToRemove } },
        });
        logger.info(`🧹 Cleaned up ${tokensToRemove.length} invalid/expired FCM tokens for user ${receiverId}.`);
      }
    }
  } catch (error) {
    logger.error(`❌ Error sending FCM Web Push Notification to user ${receiverId}:`, error);
  }
}

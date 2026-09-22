import admin from "./firebaseAdmin";
import prisma from "../db/prisma";
import logger from "../utils/logger";

interface SendFcmPushOptions {
  receiverId: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}

export function getNotificationLink(
  type: string,
  data?: Record<string, unknown> | null,
  receiverRole?: string,
): string {
  const dAny = (data || {}) as any;
  const targetJobId = String(dAny.jobId || dAny.job_id || dAny.job?.id || dAny.id || "");
  const targetAppId = String(dAny.applicationId || dAny.application_id || "");
  const normalizedType = (type || "").toUpperCase();
  const isHelper =
    String(dAny.role || receiverRole || "").toUpperCase() === "HELPER" ||
    String(dAny.receiverRole || "").toUpperCase() === "HELPER" ||
    String(dAny.userRole || "").toUpperCase() === "PROVIDER";

  switch (normalizedType) {
    case "NEW_JOB_APPLICATION":
    case "JOB_APPLICATION":
    case "JOB_APPLIED":
    case "NEW_OFFER":
    case "OFFER_RECEIVED":
    case "APPLICATION_RECEIVED":
    case "APPLICATION_WITHDRAWN":
      return targetJobId ? `/customer/request-offer/responding?id=${targetJobId}` : "/customer/request-offer";

    case "NEGOTIATION_CONFIRMED":
      if (isHelper) {
        return targetJobId && targetAppId
          ? `/provider/my-application?jobId=${targetJobId}&appId=${targetAppId}`
          : targetJobId
          ? `/provider/my-works/myJob-details?id=${targetJobId}`
          : "/provider/my-works";
      }
      return targetJobId ? `/customer/request-offer/responding?id=${targetJobId}` : "/customer/request-offer";

    case "APPLICATION_SELECTED":
    case "APPLICATION_ACCEPTED":
    case "OFFER_ACCEPTED":
    case "NEGOTIATION_ACCEPTED":
    case "HELPER_ACCEPTED":
      if (targetJobId && targetAppId) {
        return `/provider/my-application?jobId=${targetJobId}&appId=${targetAppId}`;
      }
      return targetJobId ? `/provider/my-application?jobId=${targetJobId}` : "/provider/my-application";

    case "JOB_ACCEPTED":
    case "JOB_ASSIGNED":
    case "JOB_APPROVED":
    case "NEW_REVIEW":
      return targetJobId ? `/provider/my-works/myJob-details?id=${targetJobId}` : "/provider/my-works";

    case "APPLICATION_REJECTED":
    case "APPLICATION_DECLINED":
      return "/provider/my-application";

    case "OFFER_DECLINED":
    case "OFFER_REJECTED":
    case "NEGOTIATION_REJECTED":
    case "JOB_DECLINED":
    case "JOB_REJECTED":
      return "/provider/my-works";

    case "NEW_JOB_POSTED":
    case "NEW_JOB":
    case "JOB_CREATED":
    case "JOB_POSTED":
      return targetJobId ? `/provider?jobId=${targetJobId}` : "/provider";

    case "JOB_STARTED":
    case "JOB_WORK_COMPLETED":
      if (isHelper) {
        return targetJobId ? `/provider/my-works/myJob-details?id=${targetJobId}` : "/provider/my-works";
      }
      return targetJobId ? `/customer/request-offer/active-details?id=${targetJobId}` : "/customer/request-offer";

    case "ACCOUNT_VERIFIED":
    case "VERIFICATION_REJECTED":
      return "/provider/profile";

    case "WITHDRAWAL_SUCCESSFUL":
    case "WITHDRAWAL_FAILED":
      return "/provider/earnings";

    case "NEW_MESSAGE":
    case "MESSAGE_RECEIVED":
      return isHelper ? "/provider/messages" : "/customer/messages";

    default:
      return isHelper ? "/provider/history" : "/customer/notification";
  }
}

export async function sendFcmPushNotification({
  receiverId,
  title,
  body,
  data,
}: SendFcmPushOptions): Promise<void> {
  try {
    // 1. Fetch active FCM tokens and receiver profile for role detection
    const [deviceTokens, receiverUser] = await Promise.all([
      prisma.userDeviceToken.findMany({
        where: { user_id: receiverId },
        select: { fcm_token: true },
      }),
      prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true, verification_status: true, role: true },
      }),
    ]);

    if (!deviceTokens || deviceTokens.length === 0) {
      logger.info(`ℹ️ No FCM tokens found for user ${receiverId}. Skipping Web Push.`);
      return;
    }

    const tokens = deviceTokens.map((dt) => dt.fcm_token);

    // Determine receiver role (HELPER vs CUSTOMER)
    const receiverRole =
      receiverUser?.verification_status === "VERIFIED" || receiverUser?.verification_status === "IN_REVIEW"
        ? "HELPER"
        : "CUSTOMER";

    // 2. Format string-only data payload for Firebase Cloud Messaging
    const stringDataPayload: Record<string, string> = {};
    if (data) {
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          stringDataPayload[key] = typeof val === "object" ? JSON.stringify(val) : String(val);
        }
      });
    }

    // Determine target redirection link based on notification type, job data, and receiver role
    const notifType = String(data?.type || "").toUpperCase();
    const calculatedLink = getNotificationLink(notifType, data, receiverRole);
    stringDataPayload.link = stringDataPayload.link || calculatedLink;

    // Unique deterministic tag to prevent double popups across browser service workers
    const notifTag =
      String(data?.jobId || data?.id || data?.conversationId || notifType || "zelper-notification");
    stringDataPayload.tag = notifTag;

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
          tag: notifTag,
        },
        fcmOptions: {
          link: stringDataPayload.link,
        },
      },
    };

    // 4. Send FCM Push Notification
    const response = await admin.messaging().sendEachForMulticast(multicastMessage);
    logger.info(
      `📲 Sent FCM Web Push for user ${receiverId} (Link: ${stringDataPayload.link}): ${response.successCount} succeeded, ${response.failureCount} failed.`,
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

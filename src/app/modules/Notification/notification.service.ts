import logger from "../../../utils/logger";

export const NotificationService = {
  addFcmToken: async (payload: { userId: string; token: string }) => {
    logger.info(`FCM Token received for user ${payload.userId}: ${payload.token}`);
    // Once FCM token DB schema is defined, save it here.
    return { success: true };
  },
};

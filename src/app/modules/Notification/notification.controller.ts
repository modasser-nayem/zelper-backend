import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pickOptions from "../../../shared/pick";
import { NotificationService } from "./notification.service";

export const NotificationController = {
  // save fcm token
  addFcmToken: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { token } = req.body;

    const result = await NotificationService.addFcmToken({ userId, token });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "FCM token saved successfully!",
      data: result,
    });
  }),

  // get my notifications
  getMyNotifications: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const query = pickOptions(req.query, ["page", "limit"]) as {
      page?: string;
      limit?: string;
    };

    const result = await NotificationService.getMyNotifications({
      userId,
      query,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Notifications retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // mark notification as read
  markAsRead: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await NotificationService.markAsRead({
      userId,
      notificationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Notification marked as read successfully!",
      data: result,
    });
  }),

  // mark all notifications as read
  markAllAsRead: catchAsync(async (req, res) => {
    const userId = req.user.id;

    const result = await NotificationService.markAllAsRead(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "All notifications marked as read successfully!",
      data: result,
    });
  }),
};

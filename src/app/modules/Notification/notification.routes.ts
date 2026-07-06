import { Router } from "express";
import { auth } from "../../middlewares/auth";
import { NotificationController } from "./notification.controller";

const router = Router();

// save FCM token
router.post("/fcm-token", auth(), NotificationController.addFcmToken);

// get notifications (paginated)
router.get("/", auth(), NotificationController.getMyNotifications);

// mark all notifications as read
router.patch("/read-all", auth(), NotificationController.markAllAsRead);

// mark a single notification as read
router.patch("/:id/read", auth(), NotificationController.markAsRead);

export const NotificationsRoutes = router;

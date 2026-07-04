import { Router } from "express";

const router = Router();

// Stub routes for notifications
router.get("/", (req, res) => {
  res.json({ message: "Notification route stub" });
});

export const NotificationsRoutes = router;

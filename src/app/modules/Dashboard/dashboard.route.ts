import express from "express";
import { UserRole } from "@prisma/client";
import { auth } from "../../middlewares/auth";
import { DashboardController } from "./dashboard.controller";

const router = express.Router();

// get admin stats
router.get(
  "/admin-stats",
  auth(UserRole.ADMIN),
  DashboardController.getAdminStats,
);

// get admin chart stats
router.get(
  "/admin-charts",
  auth(UserRole.ADMIN),
  DashboardController.getAdminCharts,
);

// list payments for admin panel
router.get(
  "/admin/payments",
  auth(UserRole.ADMIN),
  DashboardController.getAdminPayments,
);

// list helper wallets for admin panel
router.get(
  "/admin/wallets",
  auth(UserRole.ADMIN),
  DashboardController.getAdminWallets,
);

export const DashboardRoutes = router;

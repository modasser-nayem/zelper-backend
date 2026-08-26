import express from "express";
import { UserRole } from "@prisma/client";
import { auth } from "../../middlewares/auth";
import requestValidate from "../../middlewares/validateRequest";
import { WalletController } from "./wallet.controller";
import { WalletValidation } from "./wallet.validation";

const router = express.Router();

// ==================== Helper Routes ====================

// Get wallet balance + Stripe Connect status
router.get("/me", auth(), WalletController.getMyWallet);

// Stripe Connect onboarding — creates Express account + returns onboarding URL
router.post("/me/connect", auth(), WalletController.createConnectAccount);

// Confirm Stripe onboarding after redirect (call on return_url landing)
router.get(
  "/me/connect/confirm",
  auth(),
  WalletController.confirmConnectOnboarding,
);

// Create Connect Login Link for Express Dashboard (to update card/bank info)
router.post(
  "/me/connect/login-link",
  auth(),
  WalletController.createConnectLoginLink,
);

// Get transaction history
router.get("/me/transactions", auth(), WalletController.getMyTransactions);

// Get withdrawal history
router.get("/me/withdrawals", auth(), WalletController.getMyWithdrawals);

// Request withdrawal via Stripe Transfer
router.post(
  "/me/withdrawals",
  auth(),
  requestValidate(WalletValidation.createWithdrawal),
  WalletController.requestWithdrawal,
);

// ==================== Admin Routes ====================

// List all withdrawal requests
router.get(
  "/admin/withdrawals",
  auth(UserRole.ADMIN),
  WalletController.getAllWithdrawals,
);

export const WalletRoutes = router;

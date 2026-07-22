import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pickOptions from "../../../shared/pick";
import config from "../../../config";
import { WalletService } from "./wallet.services";

export const WalletController = {
  // Helper: get wallet balance + Connect status
  getMyWallet: catchAsync(async (req, res) => {
    const result = await WalletService.getMyWallet(req.user.id);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Wallet retrieved successfully!",
      data: result,
    });
  }),

  // Helper: start Stripe Connect onboarding
  createConnectAccount: catchAsync(async (req, res) => {
    const userId = req.user.id;

    // Build return/refresh URLs from env or request origin
    const baseUrl = config.FRONTEND_URL;
    const returnUrl = `${baseUrl}/wallet/connect/success`;
    const refreshUrl = `${baseUrl}/wallet/connect/refresh`;

    const result = await WalletService.createConnectAccount({
      userId,
      returnUrl,
      refreshUrl,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message:
        "Stripe Connect account created. Redirect the user to the onboarding URL.",
      data: result,
    });
  }),

  // Helper: confirm onboarding after returning from Stripe
  confirmConnectOnboarding: catchAsync(async (req, res) => {
    const result = await WalletService.confirmConnectOnboarding(req.user.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.onboardingComplete
        ? "Stripe account connected successfully! You can now request withdrawals."
        : "Stripe onboarding is not yet complete. Please finish the Stripe setup.",
      data: result,
    });
  }),

  // Helper: get transaction history
  getMyTransactions: catchAsync(async (req, res) => {
    const query = pickOptions(req.query, ["page", "limit", "type"]) as {
      page?: string;
      limit?: string;
      type?: string;
    };

    const result = await WalletService.getMyTransactions({
      userId: req.user.id,
      query,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Transactions retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // Helper: request withdrawal via Stripe Transfer
  requestWithdrawal: catchAsync(async (req, res) => {
    const result = await WalletService.requestWithdrawal({
      userId: req.user.id,
      data: req.body,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message:
        "Withdrawal processed successfully! Funds transferred instantly via Stripe.",
      data: result,
    });
  }),

  // Helper: get withdrawal history
  getMyWithdrawals: catchAsync(async (req, res) => {
    const query = pickOptions(req.query, ["page", "limit", "status"]) as {
      page?: string;
      limit?: string;
      status?: string;
    };

    const result = await WalletService.getMyWithdrawals({
      userId: req.user.id,
      query,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Withdrawals retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // ── Admin ─────────────────────────────────────────────────────────────────

  getAllWithdrawals: catchAsync(async (req, res) => {
    const query = pickOptions(req.query, ["page", "limit", "status"]) as {
      page?: string;
      limit?: string;
      status?: string;
    };

    const result = await WalletService.getAllWithdrawals({ query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "All withdrawals retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  updateWithdrawalStatus: catchAsync(async (req, res) => {
    const withdrawalId = req.params.id;
    const { status, note } = req.body;

    const result = await WalletService.updateWithdrawalStatus({
      withdrawalId,
      data: { status, note },
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Withdrawal status updated to ${status}!`,
      data: result,
    });
  }),
};

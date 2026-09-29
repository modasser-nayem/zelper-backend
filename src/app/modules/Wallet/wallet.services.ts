import Stripe from "stripe";
import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";
import config from "../../../config";
import { PaginationHelper } from "../../../helpers/pagination";
import { TCreateWithdrawal } from "./wallet.interface";
import { NotificationService } from "../Notification/notification.service";
import { NotificationType } from "../Notification/notification.interface";

const stripe = new Stripe(config.stripe.STRIPE_SECRET_KEY);

// helper to ensure helper has a wallet
const ensureWallet = async (helperId: string) => {
  return prisma.wallet.upsert({
    where: { helper_id: helperId },
    create: {
      helper_id: helperId,
      available_balance: 0,
      pending_balance: 0,
    },
    update: {},
  });
};

export const WalletService = {
  // get wallet details
  getMyWallet: async (userId: string) => {
    let wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
      include: {
        helper: { select: { id: true, name: true, avatar: true } },
      },
    });

    if (!wallet) {
      return {
        id: null,
        helper_id: userId,
        available_balance: 0,
        pending_balance: 0,
        stripe_account_id: null,
        stripe_onboarding_done: false,
        created_at: null,
        updated_at: null,
      };
    }

    let payoutMethod = null;

    // Auto-sync Stripe onboarding status & retrieve linked external account (Bank / Card)
    if (wallet.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(wallet.stripe_account_id);
        const isReady = Boolean(
          account.details_submitted ||
          account.payouts_enabled ||
          account.capabilities?.transfers === "active"
        );

        if (isReady && !wallet.stripe_onboarding_done) {
          wallet = await prisma.wallet.update({
            where: { id: wallet.id },
            data: { stripe_onboarding_done: true },
            include: {
              helper: { select: { id: true, name: true, avatar: true } },
            },
          });
        }

        const external = account.external_accounts?.data?.[0];
        if (external) {
          if (external.object === "bank_account") {
            const b = external as Stripe.BankAccount;
            payoutMethod = {
              type: "bank_account",
              bank_name: b.bank_name || "Bank Account",
              last4: b.last4,
              currency: b.currency,
              routing_number: b.routing_number,
              status: b.status,
            };
          } else if (external.object === "card") {
            const c = external as Stripe.Card;
            payoutMethod = {
              type: "card",
              brand: c.brand,
              last4: c.last4,
              exp_month: c.exp_month,
              exp_year: c.exp_year,
            };
          }
        }
      } catch {
        // Ignore Stripe retrieve errors
      }
    }

    return {
      ...wallet,
      payout_method: payoutMethod,
    };
  },

  // create connect account and return onboarding url
  createConnectAccount: async (payload: {
    userId: string;
    returnUrl: string;
    refreshUrl: string;
  }) => {
    const { userId, returnUrl, refreshUrl } = payload;

    const wallet = await ensureWallet(userId);

    let accountId = wallet.stripe_account_id;

    // create new express account if not exist
    if (!accountId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found!");

      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { stripe_account_id: accountId },
      });
    }

    // determine account link type (account_update if already onboarded, account_onboarding if first time)
    const linkType = wallet.stripe_onboarding_done
      ? "account_update"
      : "account_onboarding";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: linkType,
    });

    let loginUrl: string | null = null;
    if (wallet.stripe_onboarding_done) {
      try {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        loginUrl = loginLink.url;
      } catch {
        // ignore login link error if account not fully active yet
      }
    }

    return {
      accountId,
      onboardingUrl: accountLink.url,
      loginUrl,
      isUpdateMode: wallet.stripe_onboarding_done,
    };
  },

  // create Connect Login Link for Express Dashboard or update link fallback
  createConnectLoginLink: async (payload: {
    userId: string;
    returnUrl?: string;
    refreshUrl?: string;
  }) => {
    const { userId, returnUrl, refreshUrl } = payload;
    const wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
    });

    if (!wallet || !wallet.stripe_account_id) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You do not have a Connected Stripe account yet. Please complete Stripe onboarding first.",
      );
    }

    try {
      const loginLink = await stripe.accounts.createLoginLink(
        wallet.stripe_account_id,
      );
      return { url: loginLink.url };
    } catch (err: any) {
      // Fallback: If login link fails (e.g. initial onboarding incomplete or test mode restriction),
      // generate an account_update account link so user can still edit their bank/card payout details!
      const baseUrl = config.FRONTEND_URL;
      const accountLink = await stripe.accountLinks.create({
        account: wallet.stripe_account_id,
        return_url: returnUrl || `${baseUrl}/wallet/connect/success`,
        refresh_url: refreshUrl || `${baseUrl}/wallet/connect/refresh`,
        type: "account_update",
      });
      return { url: accountLink.url };
    }
  },

  // verify onboarding status
  confirmConnectOnboarding: async (userId: string) => {
    const wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
    });

    if (!wallet?.stripe_account_id) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "No Stripe account found. Please start the Connect onboarding first.",
      );
    }

    const account = await stripe.accounts.retrieve(wallet.stripe_account_id);
    const isComplete = Boolean(
      account.details_submitted ||
      account.payouts_enabled ||
      account.capabilities?.transfers === "active"
    );

    if (isComplete && !wallet.stripe_onboarding_done) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { stripe_onboarding_done: true },
      });
    }

    return {
      accountId: wallet.stripe_account_id,
      onboardingComplete: isComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    };
  },

  // get transactions
  getMyTransactions: async (payload: {
    userId: string;
    query: { page?: string; limit?: string; type?: string };
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
    });

    if (!wallet) {
      return { meta: { page, limit, total: 0, totalPages: 0 }, data: [] };
    }

    const whereConditions: Prisma.WalletTransactionWhereInput = {
      wallet_id: wallet.id,
      ...(query.type
        ? { type: query.type as Prisma.EnumWalletTransactionTypeFilter }
        : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereConditions,
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.walletTransaction.count({ where: whereConditions }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: transactions,
    };
  },

  // ── Withdrawal via Stripe Transfer ────────────────────────────────────────

  /**
   * Helper requests a withdrawal.
   * Requires payout info (Stripe Connect onboarding) to be completed first.
   */
  requestWithdrawal: async (payload: {
    userId: string;
    data: TCreateWithdrawal;
  }) => {
    const { userId, data } = payload;
    const { amount, note } = data;

    const wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
    });

    if (!wallet) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You do not have a wallet yet. Complete a job first to earn.",
      );
    }

    const available = Number(wallet.available_balance);

    if (amount > available) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Insufficient balance. Your available balance is $${available.toFixed(2)}.`,
      );
    }

    let isBoardingDone = wallet.stripe_onboarding_done;
    let accountId = wallet.stripe_account_id;

    // Check if onboarding status can be synced directly from Stripe
    if (!isBoardingDone && accountId) {
      try {
        const account = await stripe.accounts.retrieve(accountId);
        if (
          account.details_submitted ||
          account.payouts_enabled ||
          account.capabilities?.transfers === "active"
        ) {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: { stripe_onboarding_done: true },
          });
          isBoardingDone = true;
        }
      } catch {
        // Stripe retrieve error, treat as not onboarded
      }
    }

    // If onboarding is NOT done, reject withdrawal immediately!
    if (!isBoardingDone || !accountId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Withdrawal payout info not provided. You must add your bank account or card details via onboarding before requesting a withdrawal.",
        "ONBOARDING_REQUIRED",
      );
    }

    // Process instant payout transfer for onboarded account
    const withdrawal = await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
      });

      if (!currentWallet || Number(currentWallet.available_balance) < amount) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Insufficient balance or race condition detected.",
        );
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { available_balance: { decrement: amount } },
      });

      const newWithdrawal = await tx.withdrawal.create({
        data: {
          wallet_id: wallet.id,
          amount,
          bank_details: { stripe_account_id: accountId },
          status: "PENDING",
          note: note ?? null,
        },
      });

      await tx.walletTransaction.create({
        data: {
          wallet_id: wallet.id,
          type: "WITHDRAWAL",
          amount,
          reference_id: newWithdrawal.id,
          note: note ?? `Stripe Connect payout initiated`,
        },
      });

      return newWithdrawal;
    });

    try {
      let transferId = "tr_mocktransferid";
      if (!accountId.includes("mock") && !accountId.includes("seed")) {
        const transfer = await stripe.transfers.create({
          amount: Math.round(amount * 100),
          currency: "usd",
          destination: accountId,
          description: note ?? `Zelper automatic withdrawal: ${withdrawal.id}`,
          metadata: {
            withdrawal_id: withdrawal.id,
            wallet_id: wallet.id,
            helper_id: userId,
          },
        });
        transferId = transfer.id;
      }

      const completedWithdrawal = await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "COMPLETED",
          bank_details: {
            stripe_transfer_id: transferId,
            stripe_account_id: accountId,
          },
        },
      });

      await NotificationService.createNotification({
        receiverId: userId,
        type: NotificationType.WITHDRAWAL_SUCCESSFUL,
        title: "Withdrawal Successful",
        content: `Your withdrawal of $${amount} was successfully processed via Stripe.`,
        data: { withdrawalId: completedWithdrawal.id, status: "COMPLETED" },
      });

      return completedWithdrawal;
    } catch (error: any) {
      // Rollback balance & set status to FAILED
      await prisma.$transaction(async (tx) => {
        await tx.withdrawal.update({
          where: { id: withdrawal.id },
          data: {
            status: "FAILED",
            note: `Stripe transfer failed: ${error.message || error}`,
          },
        });

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { available_balance: { increment: amount } },
        });

        await tx.walletTransaction.create({
          data: {
            wallet_id: wallet.id,
            type: "REFUND",
            amount,
            reference_id: withdrawal.id,
            note: `Stripe Transfer failed. Refunded to wallet.`,
          },
        });
      });

      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Withdrawal failed: ${error.message || "Stripe payout error"}`,
      );
    }
  },

  getMyWithdrawals: async (payload: {
    userId: string;
    query: { page?: string; limit?: string; status?: string };
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
    });

    if (!wallet) {
      return { meta: { page, limit, total: 0, totalPages: 0 }, data: [] };
    }

    const whereConditions: Prisma.WithdrawalWhereInput = {
      wallet_id: wallet.id,
      ...(query.status
        ? { status: query.status as Prisma.EnumWithdrawalStatusFilter }
        : {}),
    };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: whereConditions,
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.withdrawal.count({ where: whereConditions }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: withdrawals,
    };
  },

  getAllWithdrawals: async (payload: {
    query: { page?: string; limit?: string; status?: string };
  }) => {
    const { query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const whereConditions: Prisma.WithdrawalWhereInput = {
      ...(query.status
        ? { status: query.status as Prisma.EnumWithdrawalStatusFilter }
        : {}),
    };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: whereConditions,
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
        include: {
          wallet: {
            include: {
              helper: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      prisma.withdrawal.count({ where: whereConditions }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: withdrawals,
    };
  },
};

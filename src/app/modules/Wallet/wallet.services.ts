import Stripe from "stripe";
import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";
import config from "../../../config";
import { PaginationHelper } from "../../../helpers/pagination";
import { TCreateWithdrawal, TUpdateWithdrawalStatus } from "./wallet.interface";
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
    const wallet = await prisma.wallet.findUnique({
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

    return wallet;
  },

  // create connect account and return onboarding url
  createConnectAccount: async (payload: {
    userId: string;
    returnUrl: string;
    refreshUrl: string;
  }) => {
    const { userId, returnUrl, refreshUrl } = payload;

    const wallet = await ensureWallet(userId);

    // check if already onboarding done
    if (wallet.stripe_account_id && wallet.stripe_onboarding_done) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Your Stripe account is already connected and ready for withdrawals.",
      );
    }

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
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { stripe_account_id: accountId },
      });
    }

    // create account link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: "account_onboarding",
    });

    return {
      accountId,
      onboardingUrl: accountLink.url,
    };
  },

  // verify onboarding status and execute any pending withdrawal
  confirmConnectOnboarding: async (userId: string, pendingWithdrawalId?: string) => {
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
    const isComplete = account.details_submitted && account.charges_enabled;

    if (isComplete && !wallet.stripe_onboarding_done) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { stripe_onboarding_done: true },
      });
    }

    let withdrawalCompleted = false;

    if (isComplete && pendingWithdrawalId) {
      const withdrawal = await prisma.withdrawal.findFirst({
        where: {
          id: pendingWithdrawalId,
          wallet_id: wallet.id,
          status: "PENDING",
        },
      });

      if (withdrawal) {
        const amount = Number(withdrawal.amount);
        try {
          let transferId = "tr_mocktransferid";
          if (!wallet.stripe_account_id.includes("mock") && !wallet.stripe_account_id.includes("seed")) {
            const transfer = await stripe.transfers.create({
              amount: Math.round(amount * 100),
              currency: "usd",
              destination: wallet.stripe_account_id,
              description: withdrawal.note ?? `Zelper automatic payout: ${withdrawal.id}`,
              metadata: {
                withdrawal_id: withdrawal.id,
                wallet_id: wallet.id,
                helper_id: userId,
              },
            });
            transferId = transfer.id;
          }

          await prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: {
              status: "COMPLETED",
              bank_details: {
                stripe_transfer_id: transferId,
                stripe_account_id: wallet.stripe_account_id,
              },
            },
          });

          await NotificationService.createNotification({
            receiverId: userId,
            type: NotificationType.WITHDRAWAL_SUCCESSFUL,
            title: "Withdrawal Successful",
            content: `Your automatic withdrawal of $${amount} has been processed to your card.`,
            data: { withdrawalId: withdrawal.id, status: "COMPLETED" },
          });

          withdrawalCompleted = true;
        } catch (error: any) {
          // Refund
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
                note: `Stripe payout failed. Refunded to available balance.`,
              },
            });
          });

          await NotificationService.createNotification({
            receiverId: userId,
            type: NotificationType.WITHDRAWAL_FAILED,
            title: "Withdrawal Failed",
            content: `Your withdrawal of $${amount} failed and has been refunded.`,
            data: {
              withdrawalId: withdrawal.id,
              status: "FAILED",
              reason: error.message || error,
            },
          });
        }
      }
    }

    return {
      accountId: wallet.stripe_account_id,
      onboardingComplete: isComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      withdrawalCompleted,
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
   * Fully automatic and instant using a write-safe two-phase commit:
   *  Phase 1: Deduct balance locally and create a PENDING withdrawal (locking funds).
   *  Phase 2: Perform the Stripe Connect transfer.
   *  Phase 3: Update withdrawal status to COMPLETED (on success) or FAILED + refund (on error).
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

    let accountId = wallet.stripe_account_id;

    // 1. Create a Connected Stripe Account if they don't have one
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
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { stripe_account_id: accountId },
      });
    }

    // 2. If onboarding is complete, process payout instantly
    if (wallet.stripe_onboarding_done) {
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

        return {
          onboardingRequired: false,
          withdrawal: completedWithdrawal,
        };
      } catch (error: any) {
        // Rollback
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
    }

    // 3. If onboarding is not complete, create PENDING withdrawal and return onboarding URL
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
          note: note ?? `Withdrawal pending Stripe setup`,
        },
      });

      return newWithdrawal;
    });

    const baseUrl = config.FRONTEND_URL;
    const returnUrl = `${baseUrl}/wallet/connect/success?pending_withdrawal_id=${withdrawal.id}`;
    const refreshUrl = `${baseUrl}/wallet/connect/refresh?pending_withdrawal_id=${withdrawal.id}`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId!,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: "account_onboarding",
    });

    return {
      onboardingRequired: true,
      onboardingUrl: accountLink.url,
      withdrawal,
    };
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

  updateWithdrawalStatus: async (payload: {
    withdrawalId: string;
    data: TUpdateWithdrawalStatus;
  }) => {
    const { withdrawalId, data } = payload;
    const { status, note } = data;

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: true },
    });

    if (!withdrawal) {
      throw new AppError(httpStatus.NOT_FOUND, "Withdrawal not found!");
    }

    const terminalStatuses = ["COMPLETED", "FAILED", "REJECTED"];
    if (terminalStatuses.includes(withdrawal.status)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot update a withdrawal that is already ${withdrawal.status}.`,
      );
    }

    const needsRefund = status === "REJECTED" || status === "FAILED";

    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status,
          note: note ?? withdrawal.note,
        },
      });

      if (needsRefund) {
        await tx.wallet.update({
          where: { id: withdrawal.wallet_id },
          data: { available_balance: { increment: withdrawal.amount } },
        });

        await tx.walletTransaction.create({
          data: {
            wallet_id: withdrawal.wallet_id,
            type: "REFUND",
            amount: withdrawal.amount,
            reference_id: withdrawalId,
            note: `Withdrawal ${status.toLowerCase()} — refunded to available balance`,
          },
        });
      }
    });

    return prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  },

  // create Connect Login Link
  createConnectLoginLink: async (userId: string) => {
    const wallet = await prisma.wallet.findUnique({
      where: { helper_id: userId },
    });

    if (!wallet || !wallet.stripe_account_id) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You do not have a Connected Stripe account yet. Please complete Stripe onboarding first.",
      );
    }

    const loginLink = await stripe.accounts.createLoginLink(
      wallet.stripe_account_id,
    );

    return { url: loginLink.url };
  },
};

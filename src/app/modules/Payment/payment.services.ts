import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import crypto from "crypto";
import AppError from "../../../errors/AppError";
import config from "../../../config";
import { TPaymentBreakdown } from "./payment.interface";
import { NotificationService } from "../Notification/notification.service";
import { NotificationType } from "../Notification/notification.interface";
import { PaginationHelper } from "../../../helpers/pagination";
import { PaymentStatus } from "@prisma/client";

const stripe = new Stripe(config.stripe.STRIPE_SECRET_KEY);

// calculate fee and helper amount
const calculateBreakdown = (agreedAmount: number): TPaymentBreakdown => {
  const feePercent = config.stripe.PLATFORM_FEE_PERCENT;
  const platformFee = parseFloat(
    ((agreedAmount * feePercent) / 100).toFixed(2),
  );
  const helperAmount = parseFloat((agreedAmount - platformFee).toFixed(2));
  return { agreedAmount, platformFee, helperAmount };
};

// get final agreed price based on negotiation
const resolveAgreedAmount = async (
  jobId: string,
  applicationId: string,
): Promise<number> => {
  const job = await prisma.jobPost.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(httpStatus.NOT_FOUND, "Job not found!");

  if (!job.is_negotiable) {
    return job.budget;
  }

  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Job application not found!");
  }

  if (application.negotiation_status !== "ACCEPTED") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Negotiation has not been accepted yet. Complete the price negotiation before proceeding to payment.",
    );
  }

  return application.negotiation_final_amount || job.budget;
};

// fulfill funded payment details and credit helper wallet
const fulfillPayment = async (
  paymentId: string,
  stripePaymentIntentId?: string,
) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.status !== "PENDING") {
    return;
  }

  let jobTitle = "Job Assignment";

  await prisma.$transaction(async (tx) => {
    const job = await tx.jobPost.findUnique({
      where: { id: payment.job_id },
      select: { title: true },
    });
    if (job) {
      jobTitle = job.title;
    }

    // fund escrow
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "FUNDED",
        ...(stripePaymentIntentId
          ? { stripe_payment_intent: stripePaymentIntentId }
          : {}),
      },
    });

    // assign job
    await tx.jobPost.update({
      where: { id: payment.job_id },
      data: { status: "ASSIGNED" },
    });

    // reject other helper applications
    await tx.jobApplication.updateMany({
      where: {
        job_id: payment.job_id,
        helper_id: { not: payment.helper_id },
        status: "PENDING",
      },
      data: { status: "REJECTED" },
    });

    // unlock conversation idempotently
    const existingConv = await tx.conversation.findFirst({
      where: {
        job_id: payment.job_id,
        customer_id: payment.customer_id,
        helper_id: payment.helper_id,
      },
    });

    if (existingConv) {
      if (existingConv.status !== "ACTIVE") {
        await tx.conversation.update({
          where: { id: existingConv.id },
          data: { status: "ACTIVE" },
        });
      }
    } else {
      await tx.conversation.create({
        data: {
          job_id: payment.job_id,
          customer_id: payment.customer_id,
          helper_id: payment.helper_id,
          status: "ACTIVE",
        },
      });
    }

    // credit helper's pending balance
    const wallet = await tx.wallet.upsert({
      where: { helper_id: payment.helper_id },
      create: {
        helper_id: payment.helper_id,
        available_balance: 0,
        pending_balance: payment.helper_amount,
      },
      update: {
        pending_balance: {
          increment: payment.helper_amount,
        },
      },
    });

    // log commission transaction
    await tx.walletTransaction.create({
      data: {
        wallet_id: wallet.id,
        type: "COMMISSION",
        amount: payment.platform_fee,
        reference_id: payment.id,
        note: `Platform commission for job: ${payment.job_id}`,
      },
    });
  });

  await NotificationService.createNotification({
    receiverId: payment.helper_id,
    type: NotificationType.JOB_ASSIGNED,
    title: "Job Assigned",
    content: `A customer paid and assigned you to the job: '${jobTitle}'.`,
    data: { jobId: payment.job_id, paymentId: payment.id },
  });
};

export const PaymentService = {
  // create stripe payment intent

  // create stripe checkout session
  createCheckoutSession: async (payload: {
    customerId: string;
    jobId: string;
    successUrl: string;
    cancelUrl: string;
  }) => {
    const { customerId, jobId, successUrl, cancelUrl } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        selected_application: true,
      },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job not found!");
    }

    if (job.customer_id !== customerId) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not own this job!");
    }

    if (!job.selected_application) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Please select a helper before proceeding to payment.",
      );
    }

    if (job.status === "ASSIGNED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This job is already paid and assigned!",
      );
    }

    if (job.status !== "OPEN") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot pay for a job with status '${job.status}'.`,
      );
    }

    const existingPayment = await prisma.payment.findFirst({
      where: {
        job_id: jobId,
        status: { in: ["PENDING", "FUNDED"] },
      },
    });

    if (existingPayment) {
      if (existingPayment.status === "FUNDED") {
        throw new AppError(
          httpStatus.CONFLICT,
          "This job has already been paid and funded!",
        );
      }

      // If existing payment is in PENDING state, customer left or cancelled checkout before completing it.
      // Remove stale PENDING record so a fresh Stripe Checkout session can be generated cleanly.
      await prisma.payment.delete({
        where: { id: existingPayment.id },
      });
    }

    const applicationId = job.selected_application.id;
    const helperId = job.selected_application.helper_id;

    const agreedAmount = await resolveAgreedAmount(jobId, applicationId);
    const { platformFee, helperAmount } = calculateBreakdown(agreedAmount);

    const paymentId = crypto.randomUUID();

    const appendQueryParam = (url: string, key: string, value: string) => {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}${key}=${value}`;
    };

    // build success url with placeholder parameters for the client
    let finalSuccessUrl = successUrl;
    if (!finalSuccessUrl.includes("session_id=")) {
      finalSuccessUrl = appendQueryParam(
        finalSuccessUrl,
        "session_id",
        "{CHECKOUT_SESSION_ID}",
      );
    }
    if (!finalSuccessUrl.includes("payment_id=")) {
      finalSuccessUrl = appendQueryParam(
        finalSuccessUrl,
        "payment_id",
        paymentId,
      );
    }

    // build cancel url
    let finalCancelUrl = cancelUrl;
    if (!finalCancelUrl.includes("payment_id=")) {
      finalCancelUrl = appendQueryParam(
        finalCancelUrl,
        "payment_id",
        paymentId,
      );
    }

    // create stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Zelper — Job: ${job.title}`,
              description: job.description || undefined,
            },
            unit_amount: Math.round(agreedAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      metadata: {
        payment_id: paymentId,
        job_id: jobId,
        customer_id: customerId,
        helper_id: helperId,
        application_id: applicationId,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        job_id: jobId,
        customer_id: customerId,
        helper_id: helperId,
        amount: agreedAmount,
        platform_fee: platformFee,
        helper_amount: helperAmount,
        status: "PENDING",
        stripe_payment_intent: session.id, // Store session id to look up in checkout.session.completed webhook
      },
    });

    return {
      paymentId: payment.id,
      sessionId: session.id,
      sessionUrl: session.url,
      amount: agreedAmount,
      platformFee,
      helperAmount,
      currency: "usd",
    };
  },

  // handle stripe webhook events
  handleWebhookEvent: async (rawBody: Buffer, signature: string) => {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripe.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Invalid Stripe webhook signature!",
      );
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      let payment = await prisma.payment.findFirst({
        where: { stripe_payment_intent: session.id },
      });

      if (!payment && session.metadata?.payment_id) {
        payment = await prisma.payment.findUnique({
          where: { id: session.metadata.payment_id },
        });
      }

      if (payment) {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : undefined;
        await fulfillPayment(payment.id, paymentIntentId);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;

      await prisma.payment.updateMany({
        where: {
          stripe_payment_intent: session.id,
          status: "PENDING",
        },
        data: { status: "FAILED" },
      });
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const isComplete = account.details_submitted || account.payouts_enabled || account.charges_enabled;

      if (isComplete) {
        await prisma.wallet.updateMany({
          where: {
            stripe_account_id: account.id,
            stripe_onboarding_done: false,
          },
          data: {
            stripe_onboarding_done: true,
          },
        });
      }
    }

    return { received: true };
  },

  // release escrow after job approval
  releaseEscrow: async (payload: { jobId: string }) => {
    const { jobId } = payload;

    const payment = await prisma.payment.findFirst({
      where: {
        job_id: jobId,
        status: "FUNDED",
      },
    });

    if (!payment) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "No active escrow payment found for this job!",
      );
    }

    await prisma.$transaction(async (tx) => {
      // update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "RELEASED",
          released_at: new Date(),
        },
      });

      // credit available balance in wallet
      const wallet = await tx.wallet.update({
        where: { helper_id: payment.helper_id },
        data: {
          pending_balance: { decrement: payment.helper_amount },
          available_balance: { increment: payment.helper_amount },
        },
      });

      // record transaction history
      await tx.walletTransaction.create({
        data: {
          wallet_id: wallet.id,
          type: "JOB_EARNING",
          amount: payment.helper_amount,
          reference_id: payment.id,
          note: `Escrow released for job: ${jobId}`,
        },
      });
    });

    return { released: true, amount: payment.helper_amount };
  },

  // get payment details
  getJobPayment: async (payload: { userId: string; jobId: string }) => {
    const { userId, jobId } = payload;

    const payment = await prisma.payment.findFirst({
      where: { job_id: jobId },
      include: {
        job: {
          select: { id: true, title: true, customer_id: true, status: true },
        },
      },
    });

    if (!payment) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "No payment found for this job!",
      );
    }

    if (payment.customer_id !== userId && payment.helper_id !== userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not a party to this payment!",
      );
    }

    return payment;
  },

  // get my payments (paginated payment history)
  getMyPayments: async (payload: {
    userId: string;
    query: { page?: string; limit?: string; filter?: string };
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const dateFilter: Record<string, any> = {};
    if (query.filter === "week") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      dateFilter.created_at = { gte: oneWeekAgo };
    } else if (query.filter === "month") {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      dateFilter.created_at = { gte: oneMonthAgo };
    } else if (query.filter === "year") {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      dateFilter.created_at = { gte: oneYearAgo };
    }

    const whereConditions = {
      customer_id: userId,
      status: { in: [PaymentStatus.FUNDED, PaymentStatus.RELEASED] }, // Only count completed/successful payments
      ...dateFilter,
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: whereConditions,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              scheduled_at: true,
              created_at: true,
              job_images: {
                select: { image_url: true },
                take: 1,
              },
            },
          },
          helper: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.payment.count({ where: whereConditions }),
    ]);

    // Calculate total spent for the user
    const spentAggregate = await prisma.payment.aggregate({
      where: {
        customer_id: userId,
        status: { in: [PaymentStatus.FUNDED, PaymentStatus.RELEASED] },
      },
      _sum: { amount: true },
    });

    const totalSpent = spentAggregate._sum.amount ?? 0;

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totalSpent,
      data: payments,
    };
  },
};

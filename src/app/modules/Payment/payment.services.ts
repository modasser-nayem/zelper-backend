import Stripe from "stripe";
import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";
import config from "../../../config";
import { TPaymentBreakdown } from "./payment.interface";
import { NotificationService } from "../Notification/notification.service";

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

export const PaymentService = {
  // create stripe payment intent
  createPaymentIntent: async (payload: {
    customerId: string;
    jobId: string;
  }) => {
    const { customerId, jobId } = payload;

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
      throw new AppError(
        httpStatus.CONFLICT,
        "A payment is already in progress for this job. Check your payment status.",
      );
    }

    const applicationId = job.selected_application.id;
    const helperId = job.selected_application.helper_id;

    const agreedAmount = await resolveAgreedAmount(jobId, applicationId);
    const { platformFee, helperAmount } = calculateBreakdown(agreedAmount);

    // stripe requires amount in cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(agreedAmount * 100),
      currency: "usd",
      metadata: {
        job_id: jobId,
        customer_id: customerId,
        helper_id: helperId,
        application_id: applicationId,
      },
      description: `Zelper — Job: ${job.title}`,
    });

    const payment = await prisma.payment.create({
      data: {
        job_id: jobId,
        customer_id: customerId,
        helper_id: helperId,
        amount: agreedAmount,
        platform_fee: platformFee,
        helper_amount: helperAmount,
        status: "PENDING",
        stripe_payment_intent: paymentIntent.id,
      },
    });

    return {
      paymentId: payment.id,
      clientSecret: paymentIntent.client_secret,
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

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const payment = await prisma.payment.findFirst({
        where: { stripe_payment_intent: paymentIntent.id },
      });

      if (!payment || payment.status !== "PENDING") {
        // skip if already processed or not found
        return { received: true };
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
          data: { status: "FUNDED" },
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
        title: "Job Assigned",
        content: `A customer paid and assigned you to the job: '${jobTitle}'.`,
        data: { jobId: payment.job_id, paymentId: payment.id },
      });
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      await prisma.payment.updateMany({
        where: {
          stripe_payment_intent: paymentIntent.id,
          status: "PENDING",
        },
        data: { status: "FAILED" },
      });
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const isComplete = account.details_submitted && account.charges_enabled;

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
};

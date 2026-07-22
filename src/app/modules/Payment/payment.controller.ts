import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { PaymentService } from "./payment.services";

export const PaymentController = {
  // Customer creates a Stripe PaymentIntent → receives client_secret for Stripe.js
  createPaymentIntent: catchAsync(async (req, res) => {
    const customerId = req.user.id;
    const { jobId } = req.body;

    const result = await PaymentService.createPaymentIntent({
      customerId,
      jobId,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Payment intent created successfully!",
      data: result,
    });
  }),

  // Stripe webhook — raw body, no auth middleware
  handleWebhook: catchAsync(async (req, res) => {
    const signature = req.headers["stripe-signature"] as string;

    if (!signature) {
      res
        .status(httpStatus.BAD_REQUEST)
        .json({ success: false, message: "Missing stripe-signature header!" });
      return;
    }

    const result = await PaymentService.handleWebhookEvent(
      req.body as Buffer,
      signature,
    );

    // Stripe requires a 200 response quickly — do NOT use sendResponse structure here
    res.status(httpStatus.OK).json(result);
  }),

  // Get payment details for a specific job (customer or helper)
  getJobPayment: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.jobId;

    const result = await PaymentService.getJobPayment({ userId, jobId });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Payment details retrieved successfully!",
      data: result,
    });
  }),
};

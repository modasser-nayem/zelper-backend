import express from "express";
import { auth } from "../../middlewares/auth";
import requestValidate from "../../middlewares/validateRequest";
import { PaymentController } from "./payment.controller";
import { PaymentValidation } from "./payment.validation";

const router = express.Router();

// ── Webhook (MUST be before any body-parsing middleware — raw body required) ──
// Note: express.raw() for this route is applied in app.ts BEFORE express.json()
router.post("/webhook", PaymentController.handleWebhook);

// ── Authenticated routes ──────────────────────────────────────────────────────

// Customer: create a Stripe Checkout Session for a selected job
router.post(
  "/create-checkout-session",
  auth(),
  requestValidate(PaymentValidation.createCheckoutSession),
  PaymentController.createCheckoutSession,
);

// Customer: get payment history
router.get("/history", auth(), PaymentController.getMyPayments);

// Customer or Helper: get payment details for a job
router.get("/job/:jobId", auth(), PaymentController.getJobPayment);

export const PaymentRoutes = router;

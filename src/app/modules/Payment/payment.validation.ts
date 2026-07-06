import { z } from "zod";

export const PaymentValidation = {
  createPaymentIntent: z.object({
    body: z.object({
      jobId: z.string({ required_error: "Job ID is required" }).uuid("Invalid job ID"),
    }),
  }),
};

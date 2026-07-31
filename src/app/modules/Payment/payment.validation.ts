import { z } from "zod";

export const PaymentValidation = {
  createCheckoutSession: z.object({
    jobId: z
      .string({ required_error: "Job ID is required" })
      .uuid("Invalid job ID"),
    successUrl: z.string({ required_error: "Success URL is required" }),
    cancelUrl: z.string({ required_error: "Cancel URL is required" }),
  }),
};

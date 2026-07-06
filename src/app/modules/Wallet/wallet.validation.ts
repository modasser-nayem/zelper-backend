import { z } from "zod";

export const WalletValidation = {
  createWithdrawal: z.object({
    body: z.object({
      amount: z
        .number({ required_error: "Withdrawal amount is required" })
        .positive("Amount must be greater than 0"),
      note: z.string().optional(),
    }),
  }),

  updateWithdrawalStatus: z.object({
    body: z.object({
      status: z.enum(["PROCESSING", "COMPLETED", "FAILED", "REJECTED"], {
        required_error: "Status is required",
      }),
      note: z.string().optional(),
    }),
  }),
};

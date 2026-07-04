import { z } from "zod";

export const NegotiationValidation = {
  startNegotiation: z.object({
    body: z.object({
      applicationId: z.string({ required_error: "Application ID is required" }).uuid("Invalid application ID"),
    }),
  }),
};

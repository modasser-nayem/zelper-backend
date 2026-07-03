import { z } from "zod";
import { emailSchema } from "../../validation/global";

const updateUser = z.object({
  name: z.string({ required_error: "name is required" }).nonempty().optional(),
  email: emailSchema.optional(),
});

const switchRole = z.object({
  role: z.enum(["CUSTOMER", "PROVIDER"], {
    required_error: "role is required",
  }),
});

const updateProviderStatus = z.object({
  status: z.enum(["VERIFIED", "REJECTED"], {
    required_error: "status is required",
  }),
  rejectionReason: z.string().optional(),
});

export const userValidationSchema = {
  updateUser,
  switchRole,
  updateProviderStatus,
};

import { z } from "zod";
import { emailSchema } from "../../validation/global";

const updateUser = z.object({
  name: z.string().min(1).optional(),
  email: emailSchema.optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  service_radius: z.number().int().nonnegative().optional(),
  expertise: z.union([z.string(), z.array(z.string())]).optional(),
});

const updateHelperStatus = z.object({
  status: z.enum(["VERIFIED", "REJECTED"], {
    required_error: "status is required",
  }),
  rejectionReason: z.string().optional(),
});

export const userValidationSchema = {
  updateUser,
  updateHelperStatus,
};

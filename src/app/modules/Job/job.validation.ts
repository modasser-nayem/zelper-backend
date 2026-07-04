import { z } from "zod";

const createJob = z.object({
  title: z.string({ required_error: "title is required" }).min(1, "Title cannot be empty"),
  description: z.string({ required_error: "description is required" }).min(1, "Description cannot be empty"),
  budget: z.number({ required_error: "budget is required" }).positive("Budget must be greater than zero"),
  is_negotiable: z.boolean().optional(),
  is_urgent: z.boolean().optional(),
  scheduled_at: z.string({ required_error: "scheduled_at is required" }).refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format for scheduled_at",
  }),
  latitude: z.number({ required_error: "latitude is required" }).min(-90).max(90),
  longitude: z.number({ required_error: "longitude is required" }).min(-180).max(180),
  address: z.string({ required_error: "address is required" }).min(1, "Address cannot be empty"),
});

const updateJob = createJob.partial();

export const JobValidation = {
  createJob,
  updateJob,
};

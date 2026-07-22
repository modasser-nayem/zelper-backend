import { z } from "zod";

export const ReviewValidation = {
  createReview: z.object({
    body: z.object({
      jobId: z
        .string({ required_error: "Job ID is required" })
        .uuid("Invalid job ID"),
      rating: z
        .number({ required_error: "Rating is required" })
        .int("Rating must be an integer")
        .min(1, "Rating must be at least 1")
        .max(5, "Rating cannot be more than 5"),
      comment: z
        .string({ required_error: "Comment is required" })
        .min(3, "Comment must be at least 3 characters")
        .max(500, "Comment cannot exceed 500 characters"),
    }),
  }),
};

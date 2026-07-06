import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";
import { PaginationHelper } from "../../../helpers/pagination";
import { TCreateReview } from "./review.interface";

export const ReviewService = {
  // create a review for a completed job
  createReview: async (payload: { userId: string; data: TCreateReview }) => {
    const { userId, data } = payload;
    const { jobId, rating, comment } = data;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        selected_application: true,
      },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job not found!");
    }

    if (job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "Only the customer who posted the job can leave a review!");
    }

    if (job.status !== "COMPLETED") {
      throw new AppError(httpStatus.BAD_REQUEST, "Reviews can only be submitted for completed jobs.");
    }

    if (!job.selected_application) {
      throw new AppError(httpStatus.BAD_REQUEST, "This job does not have an assigned helper.");
    }

    const helperId = job.selected_application.helper_id;

    // verify one review per job limit
    const existingReview = await prisma.review.findUnique({
      where: { job_id: jobId },
    });

    if (existingReview) {
      throw new AppError(httpStatus.CONFLICT, "You have already reviewed this job!");
    }

    const review = await prisma.$transaction(async (tx) => {
      // create review
      const newReview = await tx.review.create({
        data: {
          job_id: jobId,
          customer_id: userId,
          helper_id: helperId,
          rating,
          comment,
        },
      });

      // update job status to CLOSED
      await tx.jobPost.update({
        where: { id: jobId },
        data: { status: "CLOSED" },
      });

      // recalculate helper stats
      const stats = await tx.review.aggregate({
        _avg: { rating: true },
        _count: { rating: true },
        where: { helper_id: helperId },
      });

      const rating_average = stats._avg.rating ?? 0;
      const total_reviews = stats._count.rating ?? 0;

      await tx.user.update({
        where: { id: helperId },
        data: {
          rating_average,
          total_reviews,
          completed_jobs: { increment: 1 },
        },
      });

      return newReview;
    });

    return review;
  },

  // list reviews received by a helper (publicly visible)
  getHelperReviews: async (payload: {
    helperId: string;
    query: { page?: string; limit?: string };
  }) => {
    const { helperId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { helper_id: helperId },
        include: {
          customer: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.review.count({ where: { helper_id: helperId } }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: reviews,
    };
  },

  // list reviews received by the logged in helper
  getMyReviews: async (payload: {
    userId: string;
    query: { page?: string; limit?: string };
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { helper_id: userId },
        include: {
          customer: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.review.count({ where: { helper_id: userId } }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: reviews,
    };
  },
};

import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pickOptions from "../../../shared/pick";
import { ReviewService } from "./review.services";

export const ReviewController = {
  // create review
  createReview: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const result = await ReviewService.createReview({
      userId,
      data: req.body,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Review submitted successfully!",
      data: result,
    });
  }),

  // get reviews for helper (public)
  getHelperReviews: catchAsync(async (req, res) => {
    const helperId = req.params.helperId;
    const query = pickOptions(req.query, ["page", "limit"]) as {
      page?: string;
      limit?: string;
    };

    const result = await ReviewService.getHelperReviews({ helperId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Helper reviews retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // get my reviews (auth helper)
  getMyReviews: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const query = pickOptions(req.query, ["page", "limit"]) as {
      page?: string;
      limit?: string;
    };

    const result = await ReviewService.getMyReviews({ userId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "My reviews retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),
};

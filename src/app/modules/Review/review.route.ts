import express from "express";
import { auth } from "../../middlewares/auth";
import requestValidate from "../../middlewares/validateRequest";
import { ReviewController } from "./review.controller";
import { ReviewValidation } from "./review.validation";

const router = express.Router();

// submit a review
router.post(
  "/",
  auth(),
  requestValidate(ReviewValidation.createReview),
  ReviewController.createReview,
);

// list reviews received by the logged in helper
router.get("/me", auth(), ReviewController.getMyReviews);

// list reviews received by a helper (public)
router.get("/helper/:helperId", ReviewController.getHelperReviews);

export const ReviewRoutes = router;

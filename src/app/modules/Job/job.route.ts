import express from "express";
import { uploadFile } from "../../../upload/fileUpload";
import { auth } from "../../middlewares/auth";
import { parseFormData } from "../../middlewares/parseFormData";
import requestValidate from "../../middlewares/validateRequest";
import { JobController } from "./job.controller";
import { JobValidation } from "./job.validation";

const router = express.Router();

// ==================== Static / Named Routes (must be before /:id) ====================

// Customer: get my own job posts
router.get("/my/posts", auth(), JobController.getMyPosts);

// Helper: browse nearby open jobs
router.get("/browse", auth(), JobController.browseJobs);

// Helper: get jobs I applied to
router.get("/my/applications", auth(), JobController.getMyApplications);

// ==================== Shared Routes ====================

// Create a new job post (Form-data: files array + data JSON key)
router.post(
  "/",
  auth(),
  uploadFile.array("files"),
  parseFormData,
  requestValidate(JobValidation.createJob),
  JobController.createJob,
);

// Get single job details
router.get("/:id", auth(), JobController.getSingleJob);

// Update a job post (Form-data: files array + data JSON key)
router.put(
  "/:id",
  auth(),
  uploadFile.array("files"),
  parseFormData,
  requestValidate(JobValidation.updateJob),
  JobController.updateJob,
);

// Delete job post
router.delete("/:id", auth(), JobController.deleteJob);

// ==================== Customer (Need Help) Routes ====================

// Get job applicants list for a post (visible to the job owner/customer only)
router.get("/:id/applications", auth(), JobController.getJobApplications);

// Customer selects a helper for a job
router.patch("/:id/select-helper", auth(), JobController.selectHelper);

// Customer rejects a helper's application
router.patch("/:id/reject-application", auth(), JobController.rejectApplication);

// ==================== Helper (Help Others) Routes ====================

// Helper applies to a job post
router.post("/:id/apply", auth(), JobController.applyToJob);

// Helper withdraws job application
router.post("/:id/withdraw", auth(), JobController.withdrawApplication);

// ==================== Job Lifecycle Routes ====================

// Helper: start the job (ASSIGNED → IN_PROGRESS)
router.patch("/:id/start", auth(), JobController.startJob);

// Helper: mark job as completed (IN_PROGRESS → WAITING_FOR_APPROVAL)
router.patch("/:id/complete", auth(), JobController.completeJob);

// Customer: approve job completion → COMPLETED + escrow released
router.patch("/:id/approve", auth(), JobController.approveJob);

export const JobRoutes = router;

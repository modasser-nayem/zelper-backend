import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pickOptions from "../../../shared/pick";
import { TBrowseJobsQuery, TJobListQuery } from "./job.interface";
import { JobService } from "./job.services";

export const JobController = {
  // Create a new job post
  createJob: catchAsync(async (req, res) => {
    const customerId = req.user.id;
    const files = req.files as Express.Multer.File[];

    const result = await JobService.createJob({
      customerId,
      data: req.body,
      files,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Job post created successfully!",
      data: result,
    });
  }),

  // Update job post
  updateJob: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;
    const files = req.files as Express.Multer.File[];

    const result = await JobService.updateJob({
      userId,
      jobId,
      data: req.body,
      files,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job post updated successfully!",
      data: result,
    });
  }),

  // Delete job post
  deleteJob: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;

    await JobService.deleteJob({ userId, jobId });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job post deleted successfully!",
      data: null,
    });
  }),

  // Get single job details
  getSingleJob: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;

    const result = await JobService.getSingleJob({ userId, jobId });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job post retrieved successfully!",
      data: result,
    });
  }),

  // Helper: browse nearby open jobs
  browseJobs: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const query = pickOptions(req.query, ["searchTerm", "lat", "lng", "radius", "page", "limit"]) as TBrowseJobsQuery;
    const result = await JobService.browseJobs({ userId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Nearby jobs retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // Customer: get my job posts
  getMyPosts: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const query = pickOptions(req.query, ["searchTerm", "page", "limit", "sortBy", "sortOrder"]) as TJobListQuery;
    const result = await JobService.getMyPosts({ userId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "My job posts retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // Helper: get my job applications
  getMyApplications: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const query = pickOptions(req.query, ["searchTerm", "page", "limit"]) as TJobListQuery;
    const result = await JobService.getMyApplications({ userId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "My job applications retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // Helper applies to a job post
  applyToJob: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;

    const result = await JobService.applyToJob({ userId, jobId });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Job application submitted successfully!",
      data: result,
    });
  }),

  // Helper withdraws application
  withdrawApplication: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;

    const result = await JobService.withdrawApplication({ userId, jobId });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job application withdrawn successfully!",
      data: result,
    });
  }),

  // Get applications for a job
  getJobApplications: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;

    const result = await JobService.getJobApplications({ userId, jobId });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job applications retrieved successfully!",
      data: result,
    });
  }),

  // Customer selects helper
  selectHelper: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;
    const { applicationId } = req.body;

    const result = await JobService.selectHelper({
      userId,
      jobId,
      applicationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Helper selected successfully!",
      data: result,
    });
  }),

  // Customer rejects a helper's application
  rejectApplication: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.id;
    const { applicationId } = req.body;

    const result = await JobService.rejectApplication({
      userId,
      jobId,
      applicationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job application rejected successfully!",
      data: result,
    });
  }),
};

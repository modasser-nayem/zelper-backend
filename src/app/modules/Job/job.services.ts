import { Prisma, JobPostStatus } from "@prisma/client";
import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";
import { FileUploadHelper } from "../../../upload/fileUpload";
import { TBrowseJobsQuery, TCreateJob, TJobListQuery, TJobMaskInput, TRawCountRow, TRawJobRow, TUpdateJob, TUserPublicFields } from "./job.interface";
import { PaginationHelper } from "../../../helpers/pagination";

// Utility function to apply privacy mask to customer details
const maskCustomerDetails = (customer: TUserPublicFields | null | undefined) => {
  if (!customer) return null;
  return {
    id: customer.id,
    name: "Customer",
    avatar: null,
    rating_average: customer.rating_average,
    total_reviews: customer.total_reviews,
    completed_jobs: customer.completed_jobs,
    verification_status: customer.verification_status,
  };
};

// Utility function to apply privacy mask to helper details
const maskHelperDetails = (helper: TUserPublicFields | null | undefined) => {
  if (!helper) return null;
  return {
    id: helper.id,
    name: "Helper",
    avatar: null,
    rating_average: helper.rating_average,
    total_reviews: helper.total_reviews,
    completed_jobs: helper.completed_jobs,
    verification_status: helper.verification_status,
  };
};

// Mask job details (location and address)
const maskJobDetails = (job: TJobMaskInput, userId: string) => {
  if (!job) return null;

  const isOwner = job.customer_id === userId;
  const isAssignedHelper = job.selected_application?.helper_id === userId && job.status !== "OPEN";

  if (isOwner || isAssignedHelper) {
    return job; // Return exact details if owner or assigned helper
  }

  // Otherwise, mask exact details
  return {
    ...job,
    address: "Approximate Location",
    latitude: job.latitude ? parseFloat(job.latitude.toFixed(2)) : null,
    longitude: job.longitude ? parseFloat(job.longitude.toFixed(2)) : null,
    customer: maskCustomerDetails(job.customer),
  };
};

export const JobService = {
  // Create a new job post
  createJob: async (payload: {
    customerId: string;
    data: TCreateJob;
    files: Express.Multer.File[];
  }) => {
    const { customerId, data, files } = payload;

    const customer = await prisma.user.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new AppError(httpStatus.NOT_FOUND, "Customer account not found!");
    }

    if (customer.status !== "ACTIVE") {
      throw new AppError(httpStatus.FORBIDDEN, "Account is not active!");
    }

    // Upload job images
    let jobImages: string[] = [];
    if (files && files.length > 0) {
      const uploadResults = await FileUploadHelper.uploadMultiple(files, "job");
      jobImages = uploadResults.map((r) => r.url);
    }

    const scheduledDate = new Date(data.scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid scheduled_at date");
    }

    const result = await prisma.jobPost.create({
      data: {
        customer_id: customerId,
        title: data.title,
        description: data.description,
        budget: Number(data.budget),
        is_negotiable: data.is_negotiable ?? false,
        is_urgent: data.is_urgent ?? false,
        scheduled_at: scheduledDate,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        address: data.address,
        status: "OPEN",
        job_images: {
          create: jobImages.map((url) => ({
            image_url: url,
          })),
        },
      },
      include: {
        job_images: true,
        customer: {
          select: {
            id: true,
            name: true,
            avatar: true,
            rating_average: true,
            total_reviews: true,
            completed_jobs: true,
            verification_status: true,
          },
        },
      },
    });

    return result;
  },

  // Update job post details
  updateJob: async (payload: {
    userId: string;
    jobId: string;
    data: TUpdateJob;
    files?: Express.Multer.File[];
  }) => {
    const { userId, jobId, data, files } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: { job_images: true },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    if (job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to update this job post!");
    }

    if (job.status !== "OPEN") {
      throw new AppError(httpStatus.BAD_REQUEST, "Job post can only be updated when status is OPEN!");
    }

    // Handle optional file replacement
    let newImages: string[] = [];
    if (files && files.length > 0) {
      // Delete old images
      for (const img of job.job_images) {
        try {
          await FileUploadHelper.deleteSingle(img.image_url);
        } catch (err) {
          console.error("Failed to delete job image:", err);
        }
      }

      const uploadResults = await FileUploadHelper.uploadMultiple(files, "job");
      newImages = uploadResults.map((r) => r.url);
    }

    const updateData: Prisma.JobPostUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.budget !== undefined) updateData.budget = Number(data.budget);
    if (data.is_negotiable !== undefined) updateData.is_negotiable = data.is_negotiable;
    if (data.is_urgent !== undefined) updateData.is_urgent = data.is_urgent;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.latitude !== undefined) updateData.latitude = Number(data.latitude);
    if (data.longitude !== undefined) updateData.longitude = Number(data.longitude);
    if (data.scheduled_at !== undefined) {
      const scheduledDate = new Date(data.scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        throw new AppError(httpStatus.BAD_REQUEST, "Invalid scheduled_at date");
      }
      updateData.scheduled_at = scheduledDate;
    }

    const result = await prisma.$transaction(async (tx) => {
      if (newImages.length > 0) {
        await tx.jobImage.deleteMany({ where: { job_id: jobId } });
        updateData.job_images = {
          create: newImages.map((url) => ({
            image_url: url,
          })),
        };
      }

      return await tx.jobPost.update({
        where: { id: jobId },
        data: updateData,
        include: {
          job_images: true,
          customer: {
            select: {
              id: true,
              name: true,
              avatar: true,
              rating_average: true,
              total_reviews: true,
              completed_jobs: true,
              verification_status: true,
            },
          },
        },
      });
    });

    return result;
  },

  // Delete job post
  deleteJob: async (payload: { userId: string; jobId: string }) => {
    const { userId, jobId } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: { job_images: true },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    if (job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to delete this job post!");
    }

    // Delete files from S3/Cloudinary
    for (const img of job.job_images) {
      try {
        await FileUploadHelper.deleteSingle(img.image_url);
      } catch (err) {
        console.error("Failed to delete job image during deletion:", err);
      }
    }

    await prisma.jobPost.delete({ where: { id: jobId } });
    return null;
  },

  // Get Single Job
  getSingleJob: async (payload: { userId: string; jobId: string }) => {
    const { userId, jobId } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        job_images: true,
        customer: {
          select: {
            id: true,
            name: true,
            avatar: true,
            rating_average: true,
            total_reviews: true,
            completed_jobs: true,
            verification_status: true,
          },
        },
        selected_application: {
          select: {
            id: true,
            helper_id: true,
          },
        },
      },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    return maskJobDetails(job, userId);
  },

  // Customer: get my own job posts
  getMyPosts: async (payload: {
    userId: string;
    query: TJobListQuery;
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip, sortBy, sortOrder } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const searchCondition = query.searchTerm
      ? {
          OR: [
            { title: { contains: query.searchTerm, mode: Prisma.QueryMode.insensitive } },
            { description: { contains: query.searchTerm, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {};

    const whereConditions = { customer_id: userId, ...searchCondition };

    const [jobs, total] = await Promise.all([
      prisma.jobPost.findMany({
        where: whereConditions,
        include: {
          job_images: true,
          _count: { select: { job_applications: true } },
          selected_application: {
            select: { id: true, helper_id: true, status: true },
          },
        },
        orderBy: sortBy ? { [sortBy]: sortOrder } : { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.jobPost.count({ where: whereConditions }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: jobs,
    };
  },

  // Helper: get jobs I applied to
  getMyApplications: async (payload: {
    userId: string;
    query: TJobListQuery;
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const whereConditions = { helper_id: userId };

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where: whereConditions,
        include: {
          job: {
            include: {
              job_images: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  rating_average: true,
                  total_reviews: true,
                  completed_jobs: true,
                  verification_status: true,
                },
              },
              selected_application: {
                select: { id: true, helper_id: true },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.jobApplication.count({ where: whereConditions }),
    ]);

    const data = applications.map((app) => ({
      application_id: app.id,
      application_status: app.status,
      applied_at: app.created_at,
      job: maskJobDetails(app.job, userId),
    }));

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data,
    };
  },

  // Helper: browse nearby open jobs
  browseJobs: async (payload: {
    userId: string;
    query: TBrowseJobsQuery;
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });
    const radius = Number(query.radius || 15);

    let userLat = query.lat ? Number(query.lat) : null;
    let userLng = query.lng ? Number(query.lng) : null;

    // Fallback to profile location
    if (userLat === null || userLng === null) {
      const profile = await prisma.user.findUnique({ where: { id: userId } });
      if (profile && profile.latitude !== null && profile.longitude !== null) {
        userLat = profile.latitude;
        userLng = profile.longitude;
      }
    }

    if (userLat !== null && userLng !== null) {
      // Spatial query using Spherical Law of Cosines
      const rawJobs = await prisma.$queryRaw<TRawJobRow[]>`
        SELECT 
          id, customer_id, title, description, budget, is_negotiable, is_urgent,
          scheduled_at, latitude, longitude, address, status, created_at,
          (6371 * acos(cos(radians(${userLat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${userLng})) + sin(radians(${userLat})) * sin(radians(latitude)))) AS distance
        FROM job_posts
        WHERE status = 'OPEN'
          AND customer_id != ${userId}
          ${query.searchTerm ? Prisma.sql`AND (title ILIKE ${`%${query.searchTerm}%`} OR description ILIKE ${`%${query.searchTerm}%`})` : Prisma.empty}
          AND (6371 * acos(cos(radians(${userLat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${userLng})) + sin(radians(${userLat})) * sin(radians(latitude)))) <= ${radius}
        ORDER BY distance ASC
        LIMIT ${limit} OFFSET ${skip}
      `;

      const jobIds = rawJobs.map((j) => j.id);
      const fullJobs = await prisma.jobPost.findMany({
        where: { id: { in: jobIds } },
        include: {
          job_images: true,
          customer: {
            select: {
              id: true,
              name: true,
              avatar: true,
              rating_average: true,
              total_reviews: true,
              completed_jobs: true,
              verification_status: true,
            },
          },
        },
      });

      const distanceMap = new Map(rawJobs.map((j) => [j.id, j.distance]));
      const sortedJobs = fullJobs
        .map((job) => ({
          ...maskJobDetails(job, userId),
          distance_km: distanceMap.get(job.id)
            ? Number(Number(distanceMap.get(job.id)).toFixed(2))
            : null,
        }))
        .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));

      const countRes = await prisma.$queryRaw<TRawCountRow[]>`
        SELECT COUNT(*)::int as count
        FROM job_posts
        WHERE status = 'OPEN'
          AND customer_id != ${userId}
          ${query.searchTerm ? Prisma.sql`AND (title ILIKE ${`%${query.searchTerm}%`} OR description ILIKE ${`%${query.searchTerm}%`})` : Prisma.empty}
          AND (6371 * acos(cos(radians(${userLat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${userLng})) + sin(radians(${userLat})) * sin(radians(latitude)))) <= ${radius}
      `;
      const total = countRes[0]?.count || 0;

      return {
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        data: sortedJobs,
      };
    } else {
      // No location: return recent open jobs without distance
      const searchCondition = query.searchTerm
        ? {
            OR: [
              { title: { contains: query.searchTerm, mode: Prisma.QueryMode.insensitive } },
              { description: { contains: query.searchTerm, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {};

      const whereConditions = {
        status: "OPEN" as JobPostStatus,
        NOT: { customer_id: userId },
        ...searchCondition,
      };

      const [jobs, total] = await Promise.all([
        prisma.jobPost.findMany({
          where: whereConditions,
          include: {
            job_images: true,
            customer: {
              select: {
                id: true,
                name: true,
                avatar: true,
                rating_average: true,
                total_reviews: true,
                completed_jobs: true,
                verification_status: true,
              },
            },
          },
          orderBy: { created_at: "desc" },
          take: limit,
          skip,
        }),
        prisma.jobPost.count({ where: whereConditions }),
      ]);

      return {
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        data: jobs.map((job) => maskJobDetails(job, userId)),
      };
    }
  },

  // Helper applies to a job post
  applyToJob: async (payload: { userId: string; jobId: string }) => {
    const { userId, jobId } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    if (job.customer_id === userId) {
      throw new AppError(httpStatus.BAD_REQUEST, "You cannot apply to your own job post!");
    }

    if (job.status !== "OPEN") {
      throw new AppError(httpStatus.BAD_REQUEST, "Job post is no longer open for applications!");
    }

    // Check if helper already applied
    const existingApplication = await prisma.jobApplication.findUnique({
      where: {
        job_id_helper_id: {
          job_id: jobId,
          helper_id: userId,
        },
      },
    });

    if (existingApplication && existingApplication.status !== "WITHDRAWN") {
      throw new AppError(httpStatus.BAD_REQUEST, "You have already applied to this job!");
    }

    // Create or reactivate application
    let result;
    if (existingApplication) {
      result = await prisma.jobApplication.update({
        where: { id: existingApplication.id },
        data: { status: "PENDING" },
      });
    } else {
      result = await prisma.jobApplication.create({
        data: {
          job_id: jobId,
          helper_id: userId,
          status: "PENDING",
        },
      });
    }

    return result;
  },

  // Helper withdraws application
  withdrawApplication: async (payload: { userId: string; jobId: string }) => {
    const { userId, jobId } = payload;

    const application = await prisma.jobApplication.findUnique({
      where: {
        job_id_helper_id: {
          job_id: jobId,
          helper_id: userId,
        },
      },
    });

    if (!application) {
      throw new AppError(httpStatus.NOT_FOUND, "Job application not found!");
    }

    if (application.status === "WITHDRAWN") {
      throw new AppError(httpStatus.BAD_REQUEST, "Application is already withdrawn!");
    }

    const result = await prisma.jobApplication.update({
      where: { id: application.id },
      data: { status: "WITHDRAWN" },
    });

    return result;
  },

  // Get applications for a job (Visible to job owner/customer)
  getJobApplications: async (payload: { userId: string; jobId: string }) => {
    const { userId, jobId } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    if (job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to view applications for this job!");
    }

    const applications = await prisma.jobApplication.findMany({
      where: {
        job_id: jobId,
        status: { not: "WITHDRAWN" },
      },
      include: {
        helper: {
          select: {
            id: true,
            name: true,
            avatar: true,
            rating_average: true,
            total_reviews: true,
            completed_jobs: true,
            verification_status: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // Apply privacy mask on helper details if the helper is not selected/paid yet
    const maskedApplications = applications.map((app) => {
      const isSelected = job.selected_application_id === app.id;
      const isAssigned = job.status !== "OPEN" && isSelected;

      if (isAssigned) {
        return app; // Unmasked if helper is already assigned/hired post-payment
      }

      // Otherwise, mask exact helper details
      return {
        ...app,
        helper: maskHelperDetails(app.helper),
      };
    });

    return maskedApplications;
  },

  // Customer selects helper application
  selectHelper: async (payload: {
    userId: string;
    jobId: string;
    applicationId: string;
  }) => {
    const { userId, jobId, applicationId } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    if (job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to select a helper for this job!");
    }

    if (job.status !== "OPEN") {
      throw new AppError(httpStatus.BAD_REQUEST, "Helper can only be selected when job status is OPEN!");
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.job_id !== jobId) {
      throw new AppError(httpStatus.NOT_FOUND, "Job application not found for this job post!");
    }

    if (application.status === "WITHDRAWN" || application.status === "REJECTED") {
      throw new AppError(httpStatus.BAD_REQUEST, "Cannot select a withdrawn or rejected application!");
    }

    const result = await prisma.$transaction(async (tx) => {
      // Reset any previously selected application status back to PENDING
      if (job.selected_application_id) {
        await tx.jobApplication.update({
          where: { id: job.selected_application_id },
          data: { status: "PENDING" },
        });
      }

      // Update the newly chosen application status to SELECTED
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: { status: "SELECTED" },
      });

      // Update job to reference the selected application
      return await tx.jobPost.update({
        where: { id: jobId },
        data: {
          selected_application_id: applicationId,
        },
        include: {
          job_images: true,
          customer: {
            select: {
              id: true,
              name: true,
              avatar: true,
              rating_average: true,
              total_reviews: true,
              completed_jobs: true,
              verification_status: true,
            },
          },
          selected_application: {
            select: {
              id: true,
              helper_id: true,
              status: true,
            },
          },
        },
      });
    });

    return result;
  },

  // Customer rejects a helper's application
  rejectApplication: async (payload: {
    userId: string;
    jobId: string;
    applicationId: string;
  }) => {
    const { userId, jobId, applicationId } = payload;

    const job = await prisma.jobPost.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError(httpStatus.NOT_FOUND, "Job post not found!");
    }

    if (job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to reject applications for this job!");
    }

    if (job.status !== "OPEN") {
      throw new AppError(httpStatus.BAD_REQUEST, "Applications can only be rejected when job status is OPEN!");
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.job_id !== jobId) {
      throw new AppError(httpStatus.NOT_FOUND, "Job application not found for this job post!");
    }

    if (application.status === "REJECTED") {
      throw new AppError(httpStatus.BAD_REQUEST, "Application is already rejected!");
    }

    if (application.status === "WITHDRAWN") {
      throw new AppError(httpStatus.BAD_REQUEST, "Cannot reject a withdrawn application!");
    }

    // If rejecting the currently selected application, clear the selected_application_id on the job
    const result = await prisma.$transaction(async (tx) => {
      if (job.selected_application_id === applicationId) {
        await tx.jobPost.update({
          where: { id: jobId },
          data: { selected_application_id: null },
        });
      }

      return await tx.jobApplication.update({
        where: { id: applicationId },
        data: { status: "REJECTED" },
        include: {
          helper: {
            select: {
              id: true,
              name: true,
              avatar: true,
              rating_average: true,
              total_reviews: true,
              completed_jobs: true,
              verification_status: true,
            },
          },
        },
      });
    });

    return result;
  },
};

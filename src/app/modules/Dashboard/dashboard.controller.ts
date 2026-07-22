import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { DashboardService } from "./dashboard.services";

export const DashboardController = {
  // get admin dashboard stats
  getAdminStats: catchAsync(async (req, res) => {
    const result = await DashboardService.getAdminStats();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Admin dashboard stats retrieved successfully!",
      data: result,
    });
  }),

  // get stats for dashboard graphs
  getAdminCharts: catchAsync(async (req, res) => {
    const result = await DashboardService.getAdminCharts();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Dashboard chart stats retrieved successfully!",
      data: result,
    });
  }),

  // list all payments for admin panel
  getAdminPayments: catchAsync(async (req, res) => {
    const query = req.query as {
      page?: string;
      limit?: string;
      status?: string;
      searchTerm?: string;
    };
    const result = await DashboardService.getAdminPayments({ query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Admin payments retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // list all wallets for admin panel
  getAdminWallets: catchAsync(async (req, res) => {
    const query = req.query as { page?: string; limit?: string };
    const result = await DashboardService.getAdminWallets({ query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Admin wallets retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),
};

import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { NegotiationService } from "./negotiation.services";

export const NegotiationController = {
  // Get full negotiation session details + all offers (for page reload / history)
  getNegotiation: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const applicationId = req.params.id;

    const result = await NegotiationService.getNegotiation({
      userId,
      applicationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Negotiation retrieved successfully!",
      data: result,
    });
  }),
};

import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { NegotiationService } from "./negotiation.services";

export const NegotiationController = {
  // Customer starts a negotiation session
  startNegotiation: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { applicationId } = req.body;

    const result = await NegotiationService.startNegotiation({
      userId,
      applicationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Negotiation session started successfully!",
      data: result,
    });
  }),

  // Get full negotiation session details + all offers (for page reload / history)
  getNegotiation: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const negotiationId = req.params.id;

    const result = await NegotiationService.getNegotiation({
      userId,
      negotiationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Negotiation retrieved successfully!",
      data: result,
    });
  }),
};

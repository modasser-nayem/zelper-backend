import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";

export const NegotiationService = {
  /**
   * Get a full negotiation session with all offers (ordered oldest → newest).
   * Only the customer or the helper on the application can view.
   */
  getNegotiation: async (payload: {
    userId: string;
    applicationId: string;
  }) => {
    const { userId, applicationId } = payload;

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            budget: true,
            is_negotiable: true,
            customer_id: true,
          },
        },
        helper: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        negotiation_offers: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: { created_at: "asc" },
        },
      },
    });

    if (!application) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "Negotiation session not found!",
      );
    }

    const customerId = application.job.customer_id;
    const helperId = application.helper_id;

    if (userId !== customerId && userId !== helperId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not a participant in this negotiation!",
      );
    }

    // Map JobApplication to Negotiation response expected by frontend
    return {
      id: application.id,
      application_id: application.id,
      status: application.negotiation_status,
      final_amount: application.negotiation_final_amount,
      accepted_offer_id: application.accepted_offer_id,
      created_at: application.created_at,
      updated_at: application.updated_at,
      negotiation_offers: application.negotiation_offers.map((offer) => ({
        id: offer.id,
        negotiation_id: offer.application_id, // map application_id back to negotiation_id
        application_id: offer.application_id,
        sender_id: offer.sender_id,
        sender: offer.sender,
        amount: offer.amount,
        created_at: offer.created_at,
        updated_at: offer.updated_at,
      })),
      application: {
        id: application.id,
        helper_id: application.helper_id,
        status: application.status,
        job: application.job,
        helper: application.helper,
      },
    };
  },

  // verify participant is valid
  verifyParticipant: async (payload: {
    userId: string;
    negotiationId: string;
  }) => {
    const { userId, negotiationId } = payload;

    const application = await prisma.jobApplication.findUnique({
      where: { id: negotiationId },
      include: {
        job: { select: { customer_id: true } },
      },
    });

    if (!application) {
      throw new Error("Negotiation session not found!");
    }

    const customerId = application.job.customer_id;
    const helperId = application.helper_id;

    if (userId !== customerId && userId !== helperId) {
      throw new Error("You are not a participant in this negotiation!");
    }

    if (application.negotiation_status !== "PENDING") {
      throw new Error(
        `Negotiation is already ${application.negotiation_status?.toLowerCase() || "unknown"}.`,
      );
    }

    return {
      negotiation: {
        id: application.id,
        status: application.negotiation_status,
        final_amount: application.negotiation_final_amount,
      },
      customerId,
      helperId,
    };
  },

  // save counter offer price
  saveOffer: async (payload: {
    negotiationId: string;
    senderId: string;
    amount: number;
  }) => {
    const { negotiationId, senderId, amount } = payload;

    if (amount <= 0) {
      throw new Error("Offer amount must be greater than 0!");
    }

    const offer = await prisma.negotiationOffer.create({
      data: {
        application_id: negotiationId,
        sender_id: senderId,
        amount,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    return {
      id: offer.id,
      negotiation_id: offer.application_id, // backwards compatibility for socket emission
      application_id: offer.application_id,
      sender_id: offer.sender_id,
      sender: offer.sender,
      amount: offer.amount,
      created_at: offer.created_at,
      updated_at: offer.updated_at,
    };
  },

  // accept latest price offer
  acceptLatestOffer: async (payload: {
    userId: string;
    negotiationId: string;
  }) => {
    const { userId, negotiationId } = payload;

    const latestOffer = await prisma.negotiationOffer.findFirst({
      where: { application_id: negotiationId },
      orderBy: { created_at: "desc" },
    });

    if (!latestOffer) {
      throw new Error("No offers have been made yet. Cannot accept.");
    }

    if (latestOffer.sender_id === userId) {
      throw new Error(
        "You cannot accept your own offer. Wait for the other party to respond.",
      );
    }

    const updatedApplication = await prisma.jobApplication.update({
      where: { id: negotiationId },
      data: {
        negotiation_status: "ACCEPTED",
        negotiation_final_amount: latestOffer.amount,
        accepted_offer_id: latestOffer.id,
      },
      select: {
        id: true,
        negotiation_status: true,
        negotiation_final_amount: true,
        accepted_offer_id: true,
      },
    });

    return {
      id: updatedApplication.id,
      status: updatedApplication.negotiation_status,
      final_amount: updatedApplication.negotiation_final_amount,
      accepted_offer_id: updatedApplication.accepted_offer_id,
    };
  },

  // reject negotiation
  rejectNegotiation: async (payload: {
    userId: string;
    negotiationId: string;
    customerId: string;
  }) => {
    const { userId, negotiationId, customerId } = payload;

    const newStatus = userId === customerId ? "REJECTED" : "CANCELLED";

    const updatedApplication = await prisma.jobApplication.update({
      where: { id: negotiationId },
      data: { negotiation_status: newStatus },
      select: {
        id: true,
        negotiation_status: true,
      },
    });

    return {
      id: updatedApplication.id,
      status: updatedApplication.negotiation_status,
    };
  },
};

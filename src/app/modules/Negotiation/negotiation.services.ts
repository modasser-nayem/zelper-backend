import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";

export const NegotiationService = {
  /**
   * Customer starts a negotiation session for a selected application.
   * The job must be is_negotiable = true and the application must be SELECTED.
   * Fails if a PENDING negotiation already exists for the same application.
   */
  startNegotiation: async (payload: { userId: string; applicationId: string }) => {
    const { userId, applicationId } = payload;

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
      },
    });

    if (!application) {
      throw new AppError(httpStatus.NOT_FOUND, "Job application not found!");
    }

    // Only the job owner (customer) can start a negotiation
    if (application.job.customer_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "Only the job owner can start a negotiation!");
    }

    // Application must be in SELECTED state
    if (application.status !== "SELECTED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Negotiation can only be started for a SELECTED application. Please select this helper first.",
      );
    }

    // Job must allow negotiation
    if (!application.job.is_negotiable) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This job does not allow price negotiation. The posted budget is the fixed price.",
      );
    }

    // Prevent duplicate active negotiations
    const existingNegotiation = await prisma.negotiation.findFirst({
      where: {
        application_id: applicationId,
        status: "PENDING",
      },
    });

    if (existingNegotiation) {
      throw new AppError(
        httpStatus.CONFLICT,
        "An active negotiation already exists for this application.",
      );
    }

    // Create the negotiation — initial final_amount = job.budget (a reasonable starting reference)
    const negotiation = await prisma.negotiation.create({
      data: {
        application_id: applicationId,
        status: "PENDING",
        final_amount: application.job.budget,
      },
      include: {
        application: {
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
          },
        },
        negotiation_offers: {
          orderBy: { created_at: "desc" },
        },
      },
    });

    return negotiation;
  },

  /**
   * Get a full negotiation session with all offers (ordered oldest → newest).
   * Only the customer or the helper on the application can view.
   */
  getNegotiation: async (payload: { userId: string; negotiationId: string }) => {
    const { userId, negotiationId } = payload;

    const negotiation = await prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: {
        application: {
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
        accepted_offer: {
          select: {
            id: true,
            amount: true,
            sender_id: true,
          },
        },
      },
    });

    if (!negotiation) {
      throw new AppError(httpStatus.NOT_FOUND, "Negotiation not found!");
    }

    const customerId = negotiation.application.job.customer_id;
    const helperId = negotiation.application.helper_id;

    if (userId !== customerId && userId !== helperId) {
      throw new AppError(httpStatus.FORBIDDEN, "You are not a participant in this negotiation!");
    }

    return negotiation;
  },

  // ---- Socket-called services (used by socket handlers) ----

  /**
   * Verify the caller is a valid participant in the negotiation.
   * Returns { customerId, helperId } for further checks.
   */
  verifyParticipant: async (payload: { userId: string; negotiationId: string }) => {
    const { userId, negotiationId } = payload;

    const negotiation = await prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: {
        application: {
          include: {
            job: { select: { customer_id: true } },
          },
        },
      },
    });

    if (!negotiation) {
      throw new Error("Negotiation not found!");
    }

    const customerId = negotiation.application.job.customer_id;
    const helperId = negotiation.application.helper_id;

    if (userId !== customerId && userId !== helperId) {
      throw new Error("You are not a participant in this negotiation!");
    }

    if (negotiation.status !== "PENDING") {
      throw new Error(`Negotiation is already ${negotiation.status.toLowerCase()}.`);
    }

    return { negotiation, customerId, helperId };
  },

  /**
   * Save a new price offer to the DB.
   * Either party can send. No restriction on consecutive offers from the same party
   * (the other party can simply counter again — the "latest offer" wins).
   */
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
        negotiation_id: negotiationId,
        sender_id: senderId,
        amount,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    return offer;
  },

  /**
   * Accept the latest offer in the negotiation.
   * A party CANNOT accept their own last offer.
   */
  acceptLatestOffer: async (payload: { userId: string; negotiationId: string }) => {
    const { userId, negotiationId } = payload;

    // Get the latest offer
    const latestOffer = await prisma.negotiationOffer.findFirst({
      where: { negotiation_id: negotiationId },
      orderBy: { created_at: "desc" },
    });

    if (!latestOffer) {
      throw new Error("No offers have been made yet. Cannot accept.");
    }

    // Cannot accept your own offer
    if (latestOffer.sender_id === userId) {
      throw new Error("You cannot accept your own offer. Wait for the other party to respond.");
    }

    // Lock in the accepted offer atomically
    const updatedNegotiation = await prisma.negotiation.update({
      where: { id: negotiationId },
      data: {
        status: "ACCEPTED",
        final_amount: latestOffer.amount,
        accepted_offer_id: latestOffer.id,
      },
      select: {
        id: true,
        status: true,
        final_amount: true,
        accepted_offer_id: true,
      },
    });

    return updatedNegotiation;
  },

  /**
   * Reject the negotiation entirely.
   * Either party can reject. Customer rejection = REJECTED, Helper rejection = CANCELLED.
   */
  rejectNegotiation: async (payload: {
    userId: string;
    negotiationId: string;
    customerId: string;
  }) => {
    const { userId, negotiationId, customerId } = payload;

    // Customer rejects = REJECTED (deal fell through from buyer side)
    // Helper cancels = CANCELLED (provider walked away)
    const newStatus = userId === customerId ? "REJECTED" : "CANCELLED";

    const updatedNegotiation = await prisma.negotiation.update({
      where: { id: negotiationId },
      data: { status: newStatus },
      select: {
        id: true,
        status: true,
      },
    });

    return updatedNegotiation;
  },
};

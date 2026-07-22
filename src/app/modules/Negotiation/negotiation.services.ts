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
    negotiationId: string;
  }) => {
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
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not a participant in this negotiation!",
      );
    }

    return negotiation;
  },

  // verify participant is valid
  verifyParticipant: async (payload: {
    userId: string;
    negotiationId: string;
  }) => {
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
      throw new Error(
        `Negotiation is already ${negotiation.status.toLowerCase()}.`,
      );
    }

    return { negotiation, customerId, helperId };
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

  // accept latest price offer
  acceptLatestOffer: async (payload: {
    userId: string;
    negotiationId: string;
  }) => {
    const { userId, negotiationId } = payload;

    const latestOffer = await prisma.negotiationOffer.findFirst({
      where: { negotiation_id: negotiationId },
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

  // reject negotiation
  rejectNegotiation: async (payload: {
    userId: string;
    negotiationId: string;
    customerId: string;
  }) => {
    const { userId, negotiationId, customerId } = payload;

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

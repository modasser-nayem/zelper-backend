import { Server, Socket } from "socket.io";
import { NegotiationService } from "../app/modules/Negotiation/negotiation.services";
import { SOCKET_EVENTS } from "./socket.constant";
import {
  TAcceptOfferPayload,
  TJoinNegotiationPayload,
  TRejectNegotiationPayload,
  TSendOfferPayload,
} from "../app/modules/Negotiation/negotiation.interface";
import logger from "../utils/logger";

const negotiationRoom = (negotiationId: string) => `negotiation:${negotiationId}`;

export const handleNegotiationEvents = (io: Server, socket: Socket) => {
  const userId: string = socket.data.userId;

  const emitError = (msg: string) => {
    socket.emit(SOCKET_EVENTS.ERROR, { message: msg });
  };

  // join negotiation room
  socket.on(SOCKET_EVENTS.JOIN_NEGOTIATION, async (payload: TJoinNegotiationPayload) => {
    try {
      const { negotiationId } = payload;

      await NegotiationService.verifyParticipant({ userId, negotiationId });

      await socket.join(negotiationRoom(negotiationId));
      logger.info(`User ${userId} joined negotiation room: ${negotiationId}`);

      socket.emit(SOCKET_EVENTS.JOINED_NEGOTIATION, { negotiationId });
    } catch (err: unknown) {
      emitError(err instanceof Error ? err.message : "Failed to join negotiation room.");
    }
  });

  // send counter price offer
  socket.on(SOCKET_EVENTS.SEND_OFFER, async (payload: TSendOfferPayload) => {
    try {
      const { negotiationId, amount } = payload;

      await NegotiationService.verifyParticipant({ userId, negotiationId });

      const offer = await NegotiationService.saveOffer({
        negotiationId,
        senderId: userId,
        amount,
      });

      io.to(negotiationRoom(negotiationId)).emit(SOCKET_EVENTS.OFFER_RECEIVED, {
        offer: {
          id: offer.id,
          negotiation_id: offer.negotiation_id,
          sender_id: offer.sender_id,
          sender: offer.sender,
          amount: offer.amount,
          created_at: offer.created_at,
        },
      });

      logger.info(`Offer saved — Negotiation: ${negotiationId}, By: ${userId}, Amount: ${amount}`);
    } catch (err: unknown) {
      emitError(err instanceof Error ? err.message : "Failed to send offer.");
    }
  });

  // accept offer
  socket.on(SOCKET_EVENTS.ACCEPT_OFFER, async (payload: TAcceptOfferPayload) => {
    try {
      const { negotiationId } = payload;

      await NegotiationService.verifyParticipant({ userId, negotiationId });

      const updatedNegotiation = await NegotiationService.acceptLatestOffer({
        userId,
        negotiationId,
      });

      io.to(negotiationRoom(negotiationId)).emit(SOCKET_EVENTS.NEGOTIATION_ACCEPTED, {
        negotiation: updatedNegotiation,
      });

      logger.info(
        `Negotiation ACCEPTED — ID: ${negotiationId}, By: ${userId}, Final: ${updatedNegotiation.final_amount}`,
      );
    } catch (err: unknown) {
      emitError(err instanceof Error ? err.message : "Failed to accept offer.");
    }
  });

  // reject negotiation
  socket.on(SOCKET_EVENTS.REJECT_NEGOTIATION, async (payload: TRejectNegotiationPayload) => {
    try {
      const { negotiationId } = payload;

      const { customerId } = await NegotiationService.verifyParticipant({ userId, negotiationId });

      const updatedNegotiation = await NegotiationService.rejectNegotiation({
        userId,
        negotiationId,
        customerId,
      });

      io.to(negotiationRoom(negotiationId)).emit(SOCKET_EVENTS.NEGOTIATION_REJECTED, {
        negotiation: updatedNegotiation,
        rejected_by: userId,
      });

      logger.info(`Negotiation ENDED (${updatedNegotiation.status}) — ID: ${negotiationId}, By: ${userId}`);
    } catch (err: unknown) {
      emitError(err instanceof Error ? err.message : "Failed to reject negotiation.");
    }
  });
};

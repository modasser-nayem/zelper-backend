import { Server as HttpServer } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import config from "../config";
import logger from "../utils/logger";
import { NegotiationService } from "../app/modules/Negotiation/negotiation.services";
import {
  TAcceptOfferPayload,
  TJoinNegotiationPayload,
  TRejectNegotiationPayload,
  TSendOfferPayload,
} from "../app/modules/Negotiation/negotiation.interface";

const negotiationRoom = (negotiationId: string) => `negotiation:${negotiationId}`;

const emitError = (socket: Socket, message: string) => {
  socket.emit("error", { message });
};

// jwt verification for socket connection
const authenticateSocket = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    return next(new Error("Authentication error: Token not provided."));
  }

  try {
    const decoded = jwt.verify(token, config.token.ACCESS_TOKEN_SECRET) as JwtPayload;
    socket.data.userId = decoded.id as string;
    next();
  } catch {
    next(new Error("Authentication error: Invalid or expired token."));
  }
};

const handleNegotiationEvents = (io: Server, socket: Socket) => {
  const userId: string = socket.data.userId;

  // enter price room
  socket.on("join_negotiation", async (payload: TJoinNegotiationPayload) => {
    try {
      const { negotiationId } = payload;

      await NegotiationService.verifyParticipant({ userId, negotiationId });

      await socket.join(negotiationRoom(negotiationId));
      logger.info(`User ${userId} joined negotiation room: ${negotiationId}`);

      socket.emit("joined_negotiation", { negotiationId });
    } catch (err: unknown) {
      emitError(socket, err instanceof Error ? err.message : "Failed to join negotiation room.");
    }
  });

  // send counter price offer
  socket.on("send_offer", async (payload: TSendOfferPayload) => {
    try {
      const { negotiationId, amount } = payload;

      await NegotiationService.verifyParticipant({ userId, negotiationId });

      const offer = await NegotiationService.saveOffer({
        negotiationId,
        senderId: userId,
        amount,
      });

      io.to(negotiationRoom(negotiationId)).emit("offer_received", {
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
      emitError(socket, err instanceof Error ? err.message : "Failed to send offer.");
    }
  });

  // accept offer
  socket.on("accept_offer", async (payload: TAcceptOfferPayload) => {
    try {
      const { negotiationId } = payload;

      await NegotiationService.verifyParticipant({ userId, negotiationId });

      const updatedNegotiation = await NegotiationService.acceptLatestOffer({
        userId,
        negotiationId,
      });

      io.to(negotiationRoom(negotiationId)).emit("negotiation_accepted", {
        negotiation: updatedNegotiation,
      });

      logger.info(
        `Negotiation ACCEPTED — ID: ${negotiationId}, By: ${userId}, Final: ${updatedNegotiation.final_amount}`,
      );
    } catch (err: unknown) {
      emitError(socket, err instanceof Error ? err.message : "Failed to accept offer.");
    }
  });

  // reject negotiation
  socket.on("reject_negotiation", async (payload: TRejectNegotiationPayload) => {
    try {
      const { negotiationId } = payload;

      const { customerId } = await NegotiationService.verifyParticipant({ userId, negotiationId });

      const updatedNegotiation = await NegotiationService.rejectNegotiation({
        userId,
        negotiationId,
        customerId,
      });

      io.to(negotiationRoom(negotiationId)).emit("negotiation_rejected", {
        negotiation: updatedNegotiation,
        rejected_by: userId,
      });

      logger.info(`Negotiation ENDED (${updatedNegotiation.status}) — ID: ${negotiationId}, By: ${userId}`);
    } catch (err: unknown) {
      emitError(socket, err instanceof Error ? err.message : "Failed to reject negotiation.");
    }
  });
};

export const initSocket = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // jwt handshake auth
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    logger.info(`Socket connected: ${socket.id} (user: ${userId})`);

    handleNegotiationEvents(io, socket);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id} (user: ${userId})`);
    });
  });

  return io;
};

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

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Room name for a negotiation session */
const negotiationRoom = (negotiationId: string) => `negotiation:${negotiationId}`;

/** Emit a structured error only to the requesting socket */
const emitError = (socket: Socket, message: string) => {
  socket.emit("error", { message });
};

// ─────────────────────────────────────────────
// Auth Middleware (handshake)
// ─────────────────────────────────────────────

/**
 * Validates JWT on socket connection.
 * Token must be passed in: socket.handshake.auth.token
 * On failure the socket is disconnected immediately.
 */
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

// ─────────────────────────────────────────────
// Negotiation Socket Handlers
// ─────────────────────────────────────────────

const handleNegotiationEvents = (io: Server, socket: Socket) => {
  const userId: string = socket.data.userId;

  // ── join_negotiation ──────────────────────────────────────────
  // Client emits this after connecting to enter the price room.
  // Payload: { negotiationId: string }
  socket.on("join_negotiation", async (payload: TJoinNegotiationPayload) => {
    try {
      const { negotiationId } = payload;

      // Verify caller is a valid participant (customer or helper)
      await NegotiationService.verifyParticipant({ userId, negotiationId });

      await socket.join(negotiationRoom(negotiationId));
      logger.info(`User ${userId} joined negotiation room: ${negotiationId}`);

      // Acknowledge join to this client only
      socket.emit("joined_negotiation", { negotiationId });
    } catch (err: unknown) {
      emitError(socket, err instanceof Error ? err.message : "Failed to join negotiation room.");
    }
  });

  // ── send_offer ────────────────────────────────────────────────
  // Either party sends a counter price.
  // Flow: Customer posts $30 → Helper counters $50 → Customer counters $40 → repeat
  // Payload: { negotiationId: string, amount: number }
  socket.on("send_offer", async (payload: TSendOfferPayload) => {
    try {
      const { negotiationId, amount } = payload;

      // Re-verify participant and negotiation status on every action
      await NegotiationService.verifyParticipant({ userId, negotiationId });

      const offer = await NegotiationService.saveOffer({
        negotiationId,
        senderId: userId,
        amount,
      });

      // Broadcast the new offer to both parties in the room
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

  // ── accept_offer ──────────────────────────────────────────────
  // Either party accepts the LATEST offer made by the OTHER party.
  // Cannot accept your own last offer.
  // After acceptance: price is locked, status = ACCEPTED → proceed to payment.
  // Payload: { negotiationId: string }
  socket.on("accept_offer", async (payload: TAcceptOfferPayload) => {
    try {
      const { negotiationId } = payload;

      // verifyParticipant also checks status = PENDING
      await NegotiationService.verifyParticipant({ userId, negotiationId });

      const updatedNegotiation = await NegotiationService.acceptLatestOffer({
        userId,
        negotiationId,
      });

      // Broadcast final accepted state to both parties
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

  // ── reject_negotiation ────────────────────────────────────────
  // Either party ends the negotiation without agreement.
  // Customer ends → status = REJECTED | Helper ends → status = CANCELLED
  // Payload: { negotiationId: string }
  socket.on("reject_negotiation", async (payload: TRejectNegotiationPayload) => {
    try {
      const { negotiationId } = payload;

      const { customerId } = await NegotiationService.verifyParticipant({ userId, negotiationId });

      const updatedNegotiation = await NegotiationService.rejectNegotiation({
        userId,
        negotiationId,
        customerId,
      });

      // Broadcast rejection to both parties
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

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

export const initSocket = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Apply JWT auth middleware globally on every socket connection
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    logger.info(`Socket connected: ${socket.id} (user: ${userId})`);

    // Register all negotiation event handlers for this socket
    handleNegotiationEvents(io, socket);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id} (user: ${userId})`);
    });
  });

  return io;
};

import { Server as HttpServer } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import config from "../config";
import logger from "../utils/logger";
import { handleNegotiationEvents } from "./negotiation.handler";
import { handleChatEvents } from "./chat.handler";
import { handleLocationEvents } from "./location.handler";
import { SOCKET_EVENTS } from "./socket.constant";
import { ChatService } from "../app/modules/Chat/chat.services";
import { NegotiationService } from "../app/modules/Negotiation/negotiation.services";

const userRoom = (userId: string) => `user:${userId}`;

const onlineUsers = new Map<string, Set<string>>();

// jwt verification for socket connection
const authenticateSocket = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    return next(new Error("Authentication error: Token not provided."));
  }

  try {
    const decoded = jwt.verify(
      token,
      config.token.ACCESS_TOKEN_SECRET,
    ) as JwtPayload;
    socket.data.userId = decoded.id as string;
    next();
  } catch {
    next(new Error("Authentication error: Invalid or expired token."));
  }
};

let ioInstance: Server | null = null;

export const getIo = (): Server => {
  if (!ioInstance) {
    throw new Error("Socket.io has not been initialized!");
  }
  return ioInstance;
};

export const initSocket = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
  ioInstance = io;

  io.use(authenticateSocket);

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    const userId: string = socket.data.userId;
    logger.info(`Socket connected: ${socket.id} (user: ${userId})`);

    // join personal room
    socket.join(userRoom(userId));

    // add to presence tracker
    let userSockets = onlineUsers.get(userId);
    if (!userSockets) {
      userSockets = new Set<string>();
      onlineUsers.set(userId, userSockets);
      io.emit(SOCKET_EVENTS.USER_STATUS, { userId, status: "online" });

      // mark pending messages & counter offers as delivered since user is now online
      (async () => {
        try {
          const conversationIds =
            await ChatService.markAllUserMessagesAsDelivered(userId);
          conversationIds.forEach((id) => {
            io.to(`chat:${id}`).emit(SOCKET_EVENTS.MESSAGES_DELIVERED, {
              conversationId: id,
              receiverId: userId,
            });
          });

          const applicationIds =
            await NegotiationService.markAllUserOffersAsDelivered(userId);
          applicationIds.forEach((id) => {
            io.to(`negotiation:${id}`).emit(SOCKET_EVENTS.OFFERS_DELIVERED, {
              negotiationId: id,
              receiverId: userId,
            });
          });
        } catch (err) {
          logger.error(
            "Error marking messages/offers as delivered on connection:",
            err,
          );
        }
      })();
    }
    userSockets.add(socket.id);

    // Send current list of online users to the newly connected socket
    socket.emit(SOCKET_EVENTS.ONLINE_USERS_LIST, {
      userIds: Array.from(onlineUsers.keys()),
    });

    socket.on(SOCKET_EVENTS.GET_ONLINE_USERS, () => {
      socket.emit(SOCKET_EVENTS.ONLINE_USERS_LIST, {
        userIds: Array.from(onlineUsers.keys()),
      });
    });

    // inject sub-handlers
    handleNegotiationEvents(io, socket, onlineUsers);
    handleChatEvents(io, socket, onlineUsers);
    handleLocationEvents(io, socket);

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      logger.info(`Socket disconnected: ${socket.id} (user: ${userId})`);

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit(SOCKET_EVENTS.USER_STATUS, { userId, status: "offline" });
        }
      }
    });
  });

  return io;
};

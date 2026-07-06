import { Server as HttpServer } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import config from "../config";
import logger from "../utils/logger";
import { handleNegotiationEvents } from "./negotiation.handler";
import { handleChatEvents } from "./chat.handler";
import { SOCKET_EVENTS } from "./socket.constant";

const userRoom = (userId: string) => `user:${userId}`;

const onlineUsers = new Map<string, Set<string>>();

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

export const initSocket = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

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
    }
    userSockets.add(socket.id);

    // inject sub-handlers
    handleNegotiationEvents(io, socket);
    handleChatEvents(io, socket, onlineUsers);

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

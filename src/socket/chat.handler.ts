import { Server, Socket } from "socket.io";
import prisma from "../db/prisma";
import { ChatService } from "../app/modules/Chat/chat.services";
import { SOCKET_EVENTS } from "./socket.constant";
import logger from "../utils/logger";

const chatRoom = (conversationId: string) => `chat:${conversationId}`;
const userRoom = (userId: string) => `user:${userId}`;

export const handleChatEvents = (
  io: Server,
  socket: Socket,
  onlineUsers: Map<string, Set<string>>,
) => {
  const userId: string = socket.data.userId;

  const emitError = (msg: string) => {
    socket.emit(SOCKET_EVENTS.ERROR, { message: msg });
  };

  // join room
  socket.on(
    SOCKET_EVENTS.JOIN_CHAT,
    async (payload: { conversationId: string }) => {
      try {
        const { conversationId } = payload;

        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });

        if (!conversation) {
          return emitError("Conversation not found.");
        }

        if (
          conversation.customer_id !== userId &&
          conversation.helper_id !== userId
        ) {
          return emitError("You are not a participant in this conversation.");
        }

        await socket.join(chatRoom(conversationId));
        logger.info(`User ${userId} joined chat room: ${conversationId}`);

        socket.emit(SOCKET_EVENTS.JOINED_CHAT, { conversationId });
      } catch (err: unknown) {
        emitError(
          err instanceof Error ? err.message : "Failed to join chat room.",
        );
      }
    },
  );

  // send message
  socket.on(
    SOCKET_EVENTS.SEND_MESSAGE,
    async (payload: { conversationId: string; content: string }) => {
      try {
        const { conversationId, content } = payload;

        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });

        if (!conversation) {
          return emitError("Conversation not found.");
        }

        if (
          conversation.customer_id !== userId &&
          conversation.helper_id !== userId
        ) {
          return emitError("You are not a participant in this conversation.");
        }

        const message = await ChatService.sendMessage({
          userId,
          data: { conversationId, content },
        });

        io.to(chatRoom(conversationId)).emit(
          SOCKET_EVENTS.MESSAGE_RECEIVED,
          message,
        );

        // notify companion via user room
        const companionId =
          conversation.customer_id === userId
            ? conversation.helper_id
            : conversation.customer_id;
        io.to(userRoom(companionId)).emit(
          SOCKET_EVENTS.NEW_MESSAGE_NOTIFICATION,
          {
            conversationId,
            message,
          },
        );

        logger.info(
          `Message sent — Conv: ${conversationId}, Sender: ${userId}`,
        );
      } catch (err: unknown) {
        emitError(
          err instanceof Error ? err.message : "Failed to send message.",
        );
      }
    },
  );

  // mark messages as read
  socket.on(
    SOCKET_EVENTS.MESSAGE_SEEN,
    async (payload: { conversationId: string }) => {
      try {
        const { conversationId } = payload;

        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });

        if (!conversation) {
          return emitError("Conversation not found.");
        }

        if (
          conversation.customer_id !== userId &&
          conversation.helper_id !== userId
        ) {
          return emitError("You are not a participant in this conversation.");
        }

        await ChatService.markMessagesAsRead({ userId, conversationId });

        io.to(chatRoom(conversationId)).emit(SOCKET_EVENTS.MESSAGES_SEEN, {
          conversationId,
          readerId: userId,
        });

        logger.info(
          `Messages marked seen — Conv: ${conversationId}, Reader: ${userId}`,
        );
      } catch (err: unknown) {
        emitError(
          err instanceof Error ? err.message : "Failed to seen messages.",
        );
      }
    },
  );

  // check if a user is online
  socket.on(
    SOCKET_EVENTS.CHECK_ONLINE,
    (
      payload: { targetUserId: string },
      callback?: (isOnline: boolean) => void,
    ) => {
      const isOnline = onlineUsers.has(payload.targetUserId);
      if (callback) callback(isOnline);
    },
  );
};

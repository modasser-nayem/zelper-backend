import httpStatus from "http-status";
import prisma from "../../../db/prisma";
import AppError from "../../../errors/AppError";
import { PaginationHelper } from "../../../helpers/pagination";
import { TSendMessagePayload } from "./chat.interface";
import { MessageType } from "@prisma/client";

export const ChatService = {
  // list all user conversations
  getConversations: async (payload: {
    userId: string;
    query: { page?: string; limit?: string };
  }) => {
    const { userId, query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          OR: [{ customer_id: userId }, { helper_id: userId }],
        },
        include: {
          job: {
            select: { id: true, title: true, status: true },
          },
          customer: {
            select: { id: true, name: true, avatar: true },
          },
          helper: {
            select: { id: true, name: true, avatar: true },
          },
          messages: {
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
        orderBy: { updated_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.conversation.count({
        where: {
          OR: [{ customer_id: userId }, { helper_id: userId }],
        },
      }),
    ]);

    // calculate unread counts and format companion info
    const formattedData = await Promise.all(
      conversations.map(async (conv) => {
        const isCustomer = conv.customer_id === userId;
        const companion = isCustomer ? conv.helper : conv.customer;

        const unreadCount = await prisma.message.count({
          where: {
            conversation_id: conv.id,
            sender_id: companion.id,
            is_read: false,
          },
        });

        return {
          id: conv.id,
          job: conv.job,
          status: conv.status,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          companion,
          latestMessage: conv.messages[0] || null,
          unreadCount,
        };
      })
    );

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: formattedData,
    };
  },

  // list messages for a specific conversation
  getMessages: async (payload: {
    userId: string;
    conversationId: string;
    query: { page?: string; limit?: string };
  }) => {
    const { userId, conversationId, query } = payload;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new AppError(httpStatus.NOT_FOUND, "Conversation not found!");
    }

    if (conversation.customer_id !== userId && conversation.helper_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You are not a participant in this conversation!");
    }

    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversation_id: conversationId },
        include: {
          sender: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.message.count({
        where: { conversation_id: conversationId },
      }),
    ]);

    // return oldest -> newest for direct chat rendering
    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: messages.reverse(),
    };
  },

  // save a new message in database
  sendMessage: async (payload: {
    userId: string;
    data: TSendMessagePayload;
  }) => {
    const { userId, data } = payload;
    const { conversationId, content, type = MessageType.TEXT } = data;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new AppError(httpStatus.NOT_FOUND, "Conversation not found!");
    }

    if (conversation.customer_id !== userId && conversation.helper_id !== userId) {
      throw new AppError(httpStatus.FORBIDDEN, "You are not a participant in this conversation!");
    }

    const message = await prisma.$transaction(async (tx) => {
      const newMsg = await tx.message.create({
        data: {
          conversation_id: conversationId,
          sender_id: userId,
          content,
          type,
        },
        include: {
          sender: {
            select: { id: true, name: true, avatar: true },
          },
        },
      });

      // update conversation updated_at for ordering
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updated_at: new Date() },
      });

      return newMsg;
    });

    return message;
  },

  // mark all incoming messages as read
  markMessagesAsRead: async (payload: {
    userId: string;
    conversationId: string;
  }) => {
    const { userId, conversationId } = payload;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new AppError(httpStatus.NOT_FOUND, "Conversation not found!");
    }

    // update message read status
    await prisma.message.updateMany({
      where: {
        conversation_id: conversationId,
        sender_id: { not: userId },
        is_read: false,
      },
      data: { is_read: true },
    });

    return { success: true };
  },
};

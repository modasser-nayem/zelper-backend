import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pickOptions from "../../../shared/pick";
import { ChatService } from "./chat.services";
import { FileUploadHelper } from "../../../upload/fileUpload";
import { MessageType } from "@prisma/client";

export const ChatController = {
  // get user conversations
  getConversations: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const query = pickOptions(req.query, ["page", "limit"]) as {
      page?: string;
      limit?: string;
    };

    const result = await ChatService.getConversations({ userId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Conversations retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // get conversation messages
  getMessages: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const query = pickOptions(req.query, ["page", "limit"]) as {
      page?: string;
      limit?: string;
    };

    const result = await ChatService.getMessages({ userId, conversationId, query });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Messages retrieved successfully!",
      data: result.data,
      meta: result.meta,
    });
  }),

  // send regular text message via REST API
  sendMessage: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const result = await ChatService.sendMessage({
      userId,
      data: req.body,
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Message sent successfully!",
      data: result,
    });
  }),

  // upload media file and send message
  sendMediaMessage: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const file = req.file as Express.Multer.File;

    if (!file) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Media file is required!",
        data: null,
      });
    }

    const uploadResult = await FileUploadHelper.uploadSingle(file, "chat-media");

    const result = await ChatService.sendMessage({
      userId,
      data: {
        conversationId,
        content: uploadResult.url,
        type: MessageType.IMAGE,
      },
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Media message sent successfully!",
      data: result,
    });
  }),

  // mark conversation messages as read
  markAsRead: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const result = await ChatService.markMessagesAsRead({ userId, conversationId });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Messages marked as read successfully!",
      data: result,
    });
  }),
};

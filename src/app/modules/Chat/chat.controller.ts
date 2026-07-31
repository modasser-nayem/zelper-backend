import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pickOptions from "../../../shared/pick";
import { ChatService } from "./chat.services";
import { FileUploadHelper } from "../../../upload/fileUpload";
import { MessageType } from "@prisma/client";
import { getIo } from "../../../socket/socketHandler";
import { SOCKET_EVENTS } from "../../../socket/socket.constant";

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

    const result = await ChatService.getMessages({
      userId,
      conversationId,
      query,
    });

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

    try {
      const io = getIo();
      io.to(`chat:${req.body.conversationId}`).emit(
        SOCKET_EVENTS.MESSAGE_RECEIVED,
        result,
      );
    } catch {
      // ignore fallback
    }

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Message sent successfully!",
      data: result,
    });
  }),

  // upload media file(s) and send message
  sendMediaMessage: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const singleFile = req.file as Express.Multer.File | undefined;
    const reqFiles = req.files;
    let fileList: Express.Multer.File[] = [];

    if (singleFile) {
      fileList = [singleFile];
    } else if (Array.isArray(reqFiles)) {
      fileList = reqFiles;
    } else if (reqFiles && typeof reqFiles === "object") {
      Object.values(reqFiles).forEach((fArray) => {
        if (Array.isArray(fArray)) fileList.push(...fArray);
      });
    }

    if (fileList.length === 0) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "At least one media file is required!",
        data: null,
      });
    }

    const uploadResults = await Promise.all(
      fileList.map((f) => FileUploadHelper.uploadSingle(f, "chat-media")),
    );

    const imageUrls = uploadResults.map((r) => r.url);
    const reply_to_id = req.body?.reply_to_id as string | undefined;
    const caption = (req.body?.content as string | undefined) || "";
    const mainContent = caption.trim() !== "" ? caption.trim() : imageUrls[0];

    const result = await ChatService.sendMessage({
      userId,
      data: {
        conversationId,
        content: mainContent,
        type: MessageType.IMAGE,
        reply_to_id,
        images: imageUrls,
      },
    });

    try {
      const io = getIo();
      io.to(`chat:${conversationId}`).emit(
        SOCKET_EVENTS.MESSAGE_RECEIVED,
        result,
      );
    } catch {
      // ignore fallback
    }

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

    const result = await ChatService.markMessagesAsRead({
      userId,
      conversationId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Messages marked as read successfully!",
      data: result,
    });
  }),

  // get or create conversation by jobId
  getOrCreateConversationByJobId: catchAsync(async (req, res) => {
    const userId = req.user.id;
    const jobId = req.params.jobId;

    const result = await ChatService.getOrCreateConversationByJobId({
      userId,
      jobId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Conversation retrieved successfully!",
      data: result,
    });
  }),
};

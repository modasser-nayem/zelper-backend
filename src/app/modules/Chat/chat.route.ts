import express from "express";
import { auth } from "../../middlewares/auth";
import { uploadFile } from "../../../upload/fileUpload";
import { ChatController } from "./chat.controller";

const router = express.Router();

// list conversations
router.get("/conversations", auth(), ChatController.getConversations);

// list conversation messages
router.get("/conversations/:id/messages", auth(), ChatController.getMessages);

// send text message
router.post("/messages", auth(), ChatController.sendMessage);

// send media file message
router.post(
  "/conversations/:id/media",
  auth(),
  uploadFile.single("file"),
  ChatController.sendMediaMessage,
);

// mark messages as read
router.patch("/conversations/:id/seen", auth(), ChatController.markAsRead);

export const ChatRoutes = router;

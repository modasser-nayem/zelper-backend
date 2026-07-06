import { MessageType } from "@prisma/client";

export type TSendMessagePayload = {
  conversationId: string;
  content: string;
  type?: MessageType;
};

import { MessageType } from "@prisma/client";

export type TSendMessagePayload = {
  conversationId: string;
  content: string;
  type?: MessageType;
  reply_to_id?: string;
  images?: string[];
  is_delivered?: boolean;
};

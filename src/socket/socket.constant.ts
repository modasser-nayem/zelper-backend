export const SOCKET_EVENTS = {
  // core events
  CONNECTION: "connection",
  DISCONNECT: "disconnect",
  ERROR: "error",

  // presence events
  USER_STATUS: "user_status",
  CHECK_ONLINE: "check_online",
  GET_ONLINE_USERS: "get_online_users",
  ONLINE_USERS_LIST: "online_users_list",

  // negotiation events
  JOIN_NEGOTIATION: "join_negotiation",
  JOINED_NEGOTIATION: "joined_negotiation",
  SEND_OFFER: "send_offer",
  OFFER_RECEIVED: "offer_received",
  ACCEPT_OFFER: "accept_offer",
  NEGOTIATION_ACCEPTED: "negotiation_accepted",
  REJECT_NEGOTIATION: "reject_negotiation",
  NEGOTIATION_REJECTED: "negotiation_rejected",

  // chat events
  JOIN_CHAT: "join_chat",
  JOINED_CHAT: "joined_chat",
  SEND_MESSAGE: "send_message",
  MESSAGE_RECEIVED: "message_received",
  MESSAGE_SEEN: "message_seen",
  MESSAGES_SEEN: "messages_seen",
  MESSAGES_DELIVERED: "messages_delivered",
  NEW_MESSAGE_NOTIFICATION: "new_message_notification",
  NOTIFICATION_RECEIVED: "notification_received",

  // negotiation events continuation
  OFFERS_DELIVERED: "offers_delivered",
  OFFER_SEEN: "offer_seen",
  OFFERS_SEEN: "offers_seen",
} as const;

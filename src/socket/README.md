# Socket.io Real-Time Protocol Specification

This document specifies the authentication protocol, real-time message payloads, and response structures for the Zelper socket infrastructure.

---

## Event Tag Definitions
- **`[LISTEN]`**: Events sent by the client that the server listens to.
- **`[EMIT]`**: Events sent by the server to a specific client.
- **`[BROADCAST]`**: Events sent by the server to all users or a specific room.

---

## 1. Authentication Handshake
Clients must provide a valid JWT access token during connection establishment inside `auth.token`.

```javascript
const socket = io("http://localhost:5000", {
  auth: {
    token: "accessTokenValueHere"
  }
});
```

---

## 2. Core Presence Tracking

### `[BROADCAST]` User Online (`user_status`)
When a user connects (on their first active connection tab/socket), the server broadcasts to all connected clients.
- **Event**: `user_status`
- **Response Payload**:
```json
{
  "userId": "string (uuid)",
  "status": "online"
}
```

### `[BROADCAST]` User Offline (`user_status`)
When a user's last socket connection is closed, the server broadcasts to all connected clients.
- **Event**: `user_status`
- **Response Payload**:
```json
{
  "userId": "string (uuid)",
  "status": "offline"
}
```

### `[LISTEN]` Check Online Status (`check_online`)
Check if a specific helper or customer is currently active.
- **Event**: `check_online`
- **Request Payload**:
```json
{
  "targetUserId": "string (uuid)"
}
```
- **Response (Callback function signature)**:
```typescript
(isOnline: boolean) => void
```

---

## 3. Real-Time Chat & Messages Module

### `[LISTEN]` Join Conversation Room (`join_chat`)
Before sending or receiving messages, users must join the conversation's room.
- **Event**: `join_chat`
- **Request Payload**:
```json
{
  "conversationId": "string (uuid)"
}
```

### `[EMIT]` Joined Room Confirmation (`joined_chat`)
Emitted to the caller confirming room entry.
- **Event**: `joined_chat`
- **Response Payload**:
```json
{
  "conversationId": "string (uuid)"
}
```

### `[LISTEN]` Send Message (`send_message`)
Send a message in an active conversation.
- **Event**: `send_message`
- **Request Payload**:
```json
{
  "conversationId": "string (uuid)",
  "content": "string"
}
```

### `[BROADCAST]` Message Received (`message_received`)
Emitted to all clients in the conversation room `chat:conversationId`.
- **Event**: `message_received`
- **Response Payload**:
```json
{
  "id": "string (uuid)",
  "conversation_id": "string (uuid)",
  "sender_id": "string (uuid)",
  "type": "TEXT",
  "content": "Hello!",
  "is_read": false,
  "created_at": "string (ISO datetime)",
  "sender": {
    "id": "string (uuid)",
    "name": "John Doe",
    "avatar": "string (url)"
  }
}
```

### `[EMIT]` Direct Alert Notification (`new_message_notification`)
Emitted directly to the companion user's personal room `user:companionId` (for active in-app notifications).
- **Event**: `new_message_notification`
- **Response Payload**:
```json
{
  "conversationId": "string (uuid)",
  "message": {
    "id": "string (uuid)",
    "conversation_id": "string (uuid)",
    "sender_id": "string (uuid)",
    "type": "TEXT",
    "content": "Hello!",
    "is_read": false,
    "created_at": "string (ISO datetime)",
    "sender": {
      "id": "string (uuid)",
      "name": "John Doe",
      "avatar": "string (url)"
    }
  }
}
```

### `[LISTEN]` Mark Messages as Seen (`message_seen`)
Mark all incoming messages in the thread as read.
- **Event**: `message_seen`
- **Request Payload**:
```json
{
  "conversationId": "string (uuid)"
}
```

### `[BROADCAST]` Messages Read Notification (`messages_seen`)
Emitted to all clients in the conversation room `chat:conversationId`.
- **Event**: `messages_seen`
- **Response Payload**:
```json
{
  "conversationId": "string (uuid)",
  "readerId": "string (uuid)"
}
```

---

## 4. Real-Time Price Negotiation Module

> [!NOTE]
> There is no longer a separate `Negotiation` table in the database. A "Negotiation session" corresponds directly to a `JobApplication`. 
> Consequently, the parameter `negotiationId` passed in socket events is the `applicationId` of the application.

### `[LISTEN]` Join Negotiation Room (`join_negotiation`)
Before participating in a negotiable job budget, users must join the room.
- **Event**: `join_negotiation`
- **Request Payload**:
```json
{
  "negotiationId": "string (uuid) [Maps directly to the applicationId]"
}
```

### `[EMIT]` Joined Negotiation Confirmation (`joined_negotiation`)
Emitted to the caller confirming room entry.
- **Event**: `joined_negotiation`
- **Response Payload**:
```json
{
  "negotiationId": "string (uuid) [applicationId]"
}
```

### `[LISTEN]` Send Counter Offer (`send_offer`)
Propose a new budget.
- **Event**: `send_offer`
- **Request Payload**:
```json
{
  "negotiationId": "string (uuid) [applicationId]",
  "amount": "number"
}
```

### `[BROADCAST]` Counter Offer Received (`offer_received`)
Emitted to all clients in the room `negotiation:negotiationId`.
- **Event**: `offer_received`
- **Response Payload**:
```json
{
  "offer": {
    "id": "string (uuid)",
    "negotiation_id": "string (uuid) [Legacy support, equal to application_id]",
    "application_id": "string (uuid)",
    "sender_id": "string (uuid)",
    "amount": 150,
    "created_at": "string (ISO datetime)",
    "sender": {
      "id": "string (uuid)",
      "name": "Jane Smith",
      "avatar": "string (url)"
    }
  }
}
```

### `[LISTEN]` Accept Offer (`accept_offer`)
Accept the latest budget counter proposal.
- **Event**: `accept_offer`
- **Request Payload**:
```json
{
  "negotiationId": "string (uuid) [applicationId]"
}
```

### `[BROADCAST]` Negotiation Accepted (`negotiation_accepted`)
Emitted to all clients in the room `negotiation:negotiationId`.
- **Event**: `negotiation_accepted`
- **Response Payload**:
```json
{
  "negotiation": {
    "id": "string (uuid) [applicationId]",
    "status": "ACCEPTED",
    "final_amount": 150,
    "accepted_offer_id": "string (uuid)"
  }
}
```

### `[LISTEN]` Reject Negotiation (`reject_negotiation`)
Decline negotiation.
- **Event**: `reject_negotiation`
- **Request Payload**:
```json
{
  "negotiationId": "string (uuid) [applicationId]"
}
```

### `[BROADCAST]` Negotiation Rejected/Cancelled (`negotiation_rejected`)
Emitted to all clients in the room `negotiation:negotiationId`.
- **Event**: `negotiation_rejected`
- **Response Payload**:
```json
{
  "negotiation": {
    "id": "string (uuid) [applicationId]",
    "status": "REJECTED" // or "CANCELLED"
  },
  "rejected_by": "string (uuid)"
}
```

---

## 5. Global Error Event

### `[EMIT]` Error Occurred (`error`)
Emitted by the server to a specific client when a socket handler operation fails.
- **Event**: `error`
- **Response Payload**:
```json
{
  "message": "string (error description)"
}
```

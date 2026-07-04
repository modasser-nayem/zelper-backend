// ---- REST types ----
export type TStartNegotiation = {
  applicationId: string;
};

// ---- Socket event payload types (client → server) ----
export type TSendOfferPayload = {
  negotiationId: string;
  amount: number;
};

export type TAcceptOfferPayload = {
  negotiationId: string;
};

export type TRejectNegotiationPayload = {
  negotiationId: string;
};

export type TJoinNegotiationPayload = {
  negotiationId: string;
};

// ---- Socket event payload types (server → client) ----
export type TOfferReceivedPayload = {
  offer: {
    id: string;
    negotiation_id: string;
    sender_id: string;
    amount: number;
    created_at: Date;
  };
};

export type TNegotiationAcceptedPayload = {
  negotiation: {
    id: string;
    status: string;
    final_amount: number;
    accepted_offer_id: string | null;
  };
};

export type TNegotiationRejectedPayload = {
  negotiation: {
    id: string;
    status: string;
  };
  rejected_by: string;
};

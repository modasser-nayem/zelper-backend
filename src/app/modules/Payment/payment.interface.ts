export type TCreateCheckoutSession = {
  jobId: string;
  successUrl: string;
  cancelUrl: string;
};

// ---- Internal service types ----
export type TPaymentBreakdown = {
  agreedAmount: number; // final negotiated or posted budget
  platformFee: number; // deducted immediately
  helperAmount: number; // held in escrow until job approved
};

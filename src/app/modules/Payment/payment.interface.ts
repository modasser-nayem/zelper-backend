// ---- REST types ----
export type TCreatePaymentIntent = {
  jobId: string;
};

// ---- Internal service types ----
export type TPaymentBreakdown = {
  agreedAmount: number;        // final negotiated or posted budget
  platformFee: number;         // deducted immediately
  helperAmount: number;        // held in escrow until job approved
};

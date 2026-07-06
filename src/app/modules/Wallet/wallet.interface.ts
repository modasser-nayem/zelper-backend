// Stripe Connect onboarding URLs returned after account creation
export type TConnectOnboardingResult = {
  accountId: string;
  onboardingUrl: string;
};

// Payload for requesting a withdrawal
export type TCreateWithdrawal = {
  amount: number;
  note?: string;
};

// Admin updating withdrawal status
export type TUpdateWithdrawalStatus = {
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "REJECTED";
  note?: string;
};

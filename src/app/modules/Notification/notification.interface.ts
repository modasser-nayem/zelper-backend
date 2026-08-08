export enum NotificationType {
  // Application-related notifications
  NEW_JOB_APPLICATION = "NEW_JOB_APPLICATION",
  APPLICATION_SELECTED = "APPLICATION_SELECTED",
  APPLICATION_REJECTED = "APPLICATION_REJECTED",
  APPLICATION_WITHDRAWN = "APPLICATION_WITHDRAWN",

  // Negotiation-related notifications
  NEGOTIATION_CONFIRMED = "NEGOTIATION_CONFIRMED",

  // Job status & lifecycle notifications
  NEW_JOB_POSTED = "NEW_JOB_POSTED",
  JOB_ASSIGNED = "JOB_ASSIGNED",
  JOB_STARTED = "JOB_STARTED",
  JOB_WORK_COMPLETED = "JOB_WORK_COMPLETED",
  JOB_APPROVED = "JOB_APPROVED",

  // Identity / Admin verification
  ACCOUNT_VERIFIED = "ACCOUNT_VERIFIED",
  VERIFICATION_REJECTED = "VERIFICATION_REJECTED",

  // Wallet / Withdrawal transactions
  WITHDRAWAL_SUCCESSFUL = "WITHDRAWAL_SUCCESSFUL",
  WITHDRAWAL_FAILED = "WITHDRAWAL_FAILED",
}

export type TNewJobApplicationPayload = {
  jobId: string;
};

export type TApplicationSelectedPayload = {
  jobId: string;
  applicationId: string;
};

export type TApplicationRejectedPayload = {
  jobId: string;
  applicationId: string;
};

export type TApplicationWithdrawnPayload = {
  jobId: string;
  applicationId: string;
};

export type TNegotiationConfirmedPayload = {
  jobId: string;
  applicationId: string;
  finalAmount: number;
};

export type TJobAssignedPayload = {
  jobId: string;
  paymentId: string;
};

export type TJobStartedPayload = {
  jobId: string;
};

export type TJobWorkCompletedPayload = {
  jobId: string;
};

export type TJobApprovedPayload = {
  jobId: string;
};

export type TAccountVerifiedPayload = {
  userId: string;
  status: "VERIFIED";
};

export type TVerificationRejectedPayload = {
  userId: string;
  status: "REJECTED";
  reason: string;
};

export type TWithdrawalSuccessfulPayload = {
  withdrawalId: string;
  status: "COMPLETED";
};

export type TWithdrawalFailedPayload = {
  withdrawalId: string;
  status: "FAILED";
  reason: string;
};

export type TNotificationDataPayloads = {
  [NotificationType.NEW_JOB_APPLICATION]: TNewJobApplicationPayload;
  [NotificationType.APPLICATION_SELECTED]: TApplicationSelectedPayload;
  [NotificationType.APPLICATION_REJECTED]: TApplicationRejectedPayload;
  [NotificationType.APPLICATION_WITHDRAWN]: TApplicationWithdrawnPayload;
  [NotificationType.NEGOTIATION_CONFIRMED]: TNegotiationConfirmedPayload;
  [NotificationType.JOB_ASSIGNED]: TJobAssignedPayload;
  [NotificationType.JOB_STARTED]: TJobStartedPayload;
  [NotificationType.JOB_WORK_COMPLETED]: TJobWorkCompletedPayload;
  [NotificationType.JOB_APPROVED]: TJobApprovedPayload;
  [NotificationType.ACCOUNT_VERIFIED]: TAccountVerifiedPayload;
  [NotificationType.VERIFICATION_REJECTED]: TVerificationRejectedPayload;
  [NotificationType.WITHDRAWAL_SUCCESSFUL]: TWithdrawalSuccessfulPayload;
  [NotificationType.WITHDRAWAL_FAILED]: TWithdrawalFailedPayload;
};

export type StartOtpVerificationInput = {
  challengeId: string;
  phoneE164: string;
  expiresAt: Date;
  requestId: string;
  traceId?: string | undefined;
};

export type StartOtpVerificationResult = {
  provider: string;
  providerVerificationId?: string | undefined;
};

export type CheckOtpVerificationInput = {
  challengeId: string;
  phoneE164: string;
  code: string;
  requestId: string;
  traceId?: string | undefined;
};

export type CheckOtpVerificationResult = {
  approved: boolean;
  provider: string;
  providerVerificationId?: string | undefined;
};

export interface OtpVerificationProvider {
  startVerification(input: StartOtpVerificationInput): Promise<StartOtpVerificationResult>;
  checkVerification(input: CheckOtpVerificationInput): Promise<CheckOtpVerificationResult>;
}

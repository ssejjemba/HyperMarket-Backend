import type {
  OtpVerificationProvider,
  CheckOtpVerificationInput,
  CheckOtpVerificationResult,
  StartOtpVerificationInput,
  StartOtpVerificationResult
} from './OtpVerificationProvider';
import type { TwilioVerifyClient } from './TwilioVerifyClient';

type ProviderConfig = {
  client: TwilioVerifyClient;
};

export const createTwilioOtpVerificationProvider = (
  config: ProviderConfig
): OtpVerificationProvider => {
  return {
    async startVerification(input: StartOtpVerificationInput): Promise<StartOtpVerificationResult> {
      const result = await config.client.startVerification({
        phoneE164: input.phoneE164,
        channel: 'sms'
      });

      return {
        provider: 'twilio',
        providerVerificationId: result.sid
      };
    },

    async checkVerification(input: CheckOtpVerificationInput): Promise<CheckOtpVerificationResult> {
      const result = await config.client.checkVerification({
        phoneE164: input.phoneE164,
        code: input.code
      });

      return {
        approved: result.approved,
        provider: 'twilio',
        providerVerificationId: result.sid
      };
    }
  };
};

import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { IaaError, createTwilioVerifyClient } from '@hypermarket/modules/iaa';
import type { TwilioHttpClient } from '@hypermarket/modules/iaa';

const CONFIG = {
  accountSid: 'ACtestaccountsid000000000000000000',
  authToken: 'super-secret-auth-token',
  serviceSid: 'VAtestservicesid000000000000000000',
  timeoutMs: 5_000
};

describe('TwilioVerifyClient', () => {
  it('startVerification returns sid/status and sends form-encoded request', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 201,
      json: { sid: 'VE123', status: 'pending' }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    const result = await client.startVerification({
      phoneE164: '+256712345678',
      channel: 'sms'
    });

    expect(result).toEqual({ sid: 'VE123', status: 'pending' });
    expect(httpClient).toHaveBeenCalledTimes(1);

    const [request] = httpClient.mock.calls[0];
    expect(request.url).toBe(
      'https://verify.twilio.com/v2/Services/VAtestservicesid000000000000000000/Verifications'
    );
    expect(request.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(request.headers['authorization']).toMatch(/^Basic /);
    expect(request.body).toContain('To=%2B256712345678');
    expect(request.body).toContain('Channel=sms');
    expect(request.body).not.toContain(CONFIG.authToken);
  });

  it('checkVerification returns approved=true for approved status', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 200,
      json: { sid: 'VE234', status: 'approved' }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    const result = await client.checkVerification({
      phoneE164: '+256712345678',
      code: '123456'
    });

    expect(result).toEqual({ sid: 'VE234', status: 'approved', approved: true });
  });

  it('checkVerification returns approved=false for denied status', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 200,
      json: { sid: 'VE345', status: 'pending' }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    const result = await client.checkVerification({
      phoneE164: '+256712345678',
      code: '123456'
    });

    expect(result).toEqual({ sid: 'VE345', status: 'pending', approved: false });
  });

  it('maps provider auth failures to AUTH_PROVIDER_AUTH_FAILED', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 401,
      json: { message: 'Authenticate' }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    await expect(
      client.startVerification({ phoneE164: '+256712345678', channel: 'sms' })
    ).rejects.toMatchObject({
      code: ErrorCode.AuthProviderAuthFailed
    } satisfies Partial<IaaError>);
  });

  it('maps provider rate limits to AUTH_PROVIDER_RATE_LIMITED', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 429,
      json: { message: 'Too many requests' }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    await expect(
      client.startVerification({ phoneE164: '+256712345678', channel: 'sms' })
    ).rejects.toMatchObject({
      code: ErrorCode.AuthProviderRateLimited
    } satisfies Partial<IaaError>);
  });

  it('maps provider invalid phone responses to AUTH_INVALID_PHONE_FORMAT', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 400,
      json: { message: 'The "To" phone number is not a valid E.164 phone number.' }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    await expect(
      client.startVerification({ phoneE164: 'bad-phone', channel: 'sms' })
    ).rejects.toMatchObject({
      code: ErrorCode.AuthInvalidPhoneFormat
    } satisfies Partial<IaaError>);
  });

  it('maps network and timeout failures to AUTH_PROVIDER_UNAVAILABLE', async () => {
    const httpClient = vi
      .fn<TwilioHttpClient>()
      .mockRejectedValue(new Error(`timeout while using ${CONFIG.authToken}`));
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    await expect(
      client.startVerification({ phoneE164: '+256712345678', channel: 'sms' })
    ).rejects.toMatchObject({
      code: ErrorCode.AuthProviderUnavailable,
      message: 'OTP provider is unavailable'
    } satisfies Partial<IaaError>);

    try {
      await client.startVerification({ phoneE164: '+256712345678', channel: 'sms' });
    } catch (error) {
      expect(error).toBeInstanceOf(IaaError);
      const serialised = JSON.stringify(error);
      expect(serialised).not.toContain(CONFIG.authToken);
    }
  });

  it('maps malformed success payloads to AUTH_PROVIDER_UNAVAILABLE', async () => {
    const httpClient = vi.fn<TwilioHttpClient>().mockResolvedValue({
      status: 200,
      json: { status: 123 }
    });
    const client = createTwilioVerifyClient(CONFIG, { httpClient });

    await expect(
      client.startVerification({ phoneE164: '+256712345678', channel: 'sms' })
    ).rejects.toMatchObject({
      code: ErrorCode.AuthProviderUnavailable
    } satisfies Partial<IaaError>);
  });
});

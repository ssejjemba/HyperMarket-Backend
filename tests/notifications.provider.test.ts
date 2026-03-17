import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { createTwilioSmsProvider } from '@hypermarket/modules/notifications';
import type { TwilioSmsHttpClient } from '@hypermarket/modules/notifications';

const CONFIG = {
  accountSid: 'ACtestaccountsid000000000000000000',
  authToken: 'super-secret-auth-token',
  from: '+256700000000',
  timeoutMs: 5_000
};

describe('TwilioSmsProvider', () => {
  it('sends form-encoded sms requests', async () => {
    const httpClient = vi.fn<TwilioSmsHttpClient>().mockResolvedValue({
      status: 201,
      json: { sid: 'SM123', status: 'queued' }
    });
    const provider = createTwilioSmsProvider(CONFIG, { httpClient });

    const result = await provider.send({
      channel: 'sms',
      recipient: '+256712345678',
      text: 'Test message',
      payload: {}
    });

    expect(result).toMatchObject({
      status: 'SENT',
      provider: 'twilio_sms',
      providerMessageId: 'SM123'
    });
    const [request] = httpClient.mock.calls[0];
    expect(request.url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/ACtestaccountsid000000000000000000/Messages.json'
    );
    expect(request.headers.authorization).toMatch(/^Basic /);
    expect(request.body).toContain('To=%2B256712345678');
    expect(request.body).toContain('From=%2B256700000000');
    expect(request.body).toContain('Body=Test+message');
  });

  it('maps auth failures to non-retryable provider auth failures', async () => {
    const httpClient = vi.fn<TwilioSmsHttpClient>().mockResolvedValue({
      status: 401,
      json: { message: 'Authenticate' }
    });
    const provider = createTwilioSmsProvider(CONFIG, { httpClient });

    await expect(
      provider.send({
        channel: 'sms',
        recipient: '+256712345678',
        text: 'Test message',
        payload: {}
      })
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: false,
      errorCode: ErrorCode.NotProviderAuthFailed
    });
  });

  it('maps rate limits to retryable failures', async () => {
    const httpClient = vi.fn<TwilioSmsHttpClient>().mockResolvedValue({
      status: 429,
      json: { message: 'Too many requests' }
    });
    const provider = createTwilioSmsProvider(CONFIG, { httpClient });

    await expect(
      provider.send({
        channel: 'sms',
        recipient: '+256712345678',
        text: 'Test message',
        payload: {}
      })
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: true,
      errorCode: ErrorCode.NotProviderRateLimited
    });
  });

  it('maps invalid destination errors to non-retryable failures', async () => {
    const httpClient = vi.fn<TwilioSmsHttpClient>().mockResolvedValue({
      status: 400,
      json: { message: 'The To number is invalid' }
    });
    const provider = createTwilioSmsProvider(CONFIG, { httpClient });

    await expect(
      provider.send({
        channel: 'sms',
        recipient: '+256712345678',
        text: 'Test message',
        payload: {}
      })
    ).resolves.toMatchObject({
      status: 'FAILED',
      retryable: false,
      errorCode: ErrorCode.NotSendFailedNonRetryable
    });
  });
});

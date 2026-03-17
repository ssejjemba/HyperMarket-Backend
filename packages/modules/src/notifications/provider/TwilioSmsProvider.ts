import { ErrorCode } from '@hypermarket/contracts';

import { NotificationError } from '../errors/NotificationError';
import type {
  NotificationProvider,
  NotificationProviderSendResult,
  NotificationSendMessage
} from './NotificationProvider';

type TwilioSmsProviderConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  timeoutMs?: number | undefined;
};

type HttpRequest = {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

type HttpResponse = {
  status: number;
  json: unknown;
};

export type TwilioSmsHttpClient = (request: HttpRequest) => Promise<HttpResponse>;

type TwilioSmsSuccessBody = {
  sid?: string;
  status?: string;
};

type TwilioSmsErrorBody = {
  message?: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;

const toBasicAuthHeader = (accountSid: string, authToken: string): string => {
  const encoded = Buffer.from(`${accountSid}:${authToken}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
};

const createDefaultHttpClient = (): TwilioSmsHttpClient => {
  return async (request) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal
      });
      const text = await response.text();
      let json: unknown = {};

      if (text !== '') {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          json = { message: text };
        }
      }

      return {
        status: response.status,
        json
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new NotificationError({
          code: ErrorCode.NotProviderUnavailable,
          message: 'Notification provider timed out',
          cause: error
        });
      }

      throw new NotificationError({
        code: ErrorCode.NotProviderUnavailable,
        message: 'Notification provider request failed',
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  };
};

const asErrorBody = (value: unknown): TwilioSmsErrorBody =>
  typeof value === 'object' && value !== null ? (value as TwilioSmsErrorBody) : {};

const asSuccessBody = (value: unknown): TwilioSmsSuccessBody =>
  typeof value === 'object' && value !== null ? (value as TwilioSmsSuccessBody) : {};

const mapProviderFailure = (
  status: number,
  body: TwilioSmsErrorBody
): NotificationProviderSendResult => {
  const safeMessage = body.message ?? 'Notification provider rejected the message';

  if (status === 401 || status === 403) {
    return {
      status: 'FAILED',
      provider: 'twilio_sms',
      failureCategory: 'auth_failed',
      retryable: false,
      errorCode: ErrorCode.NotProviderAuthFailed,
      errorMessage: safeMessage
    };
  }

  if (status === 429) {
    return {
      status: 'FAILED',
      provider: 'twilio_sms',
      failureCategory: 'rate_limited',
      retryable: true,
      errorCode: ErrorCode.NotProviderRateLimited,
      errorMessage: safeMessage
    };
  }

  if (status === 400 || status === 404) {
    return {
      status: 'FAILED',
      provider: 'twilio_sms',
      failureCategory: 'invalid_destination',
      retryable: false,
      errorCode: ErrorCode.NotSendFailedNonRetryable,
      errorMessage: safeMessage
    };
  }

  return {
    status: 'FAILED',
    provider: 'twilio_sms',
    failureCategory: 'provider_down',
    retryable: true,
    errorCode: ErrorCode.NotSendFailedRetryable,
    errorMessage: safeMessage
  };
};

export const createTwilioSmsProvider = (
  config: TwilioSmsProviderConfig,
  deps: { httpClient?: TwilioSmsHttpClient | undefined } = {}
): NotificationProvider => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const httpClient = deps.httpClient ?? createDefaultHttpClient();
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const authHeader = toBasicAuthHeader(config.accountSid, config.authToken);

  return {
    providerName: 'twilio_sms',

    async send(message: NotificationSendMessage): Promise<NotificationProviderSendResult> {
      const response = await httpClient({
        method: 'POST',
        url: baseUrl,
        headers: {
          authorization: authHeader,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: message.recipient,
          From: config.from,
          Body: message.text
        }).toString(),
        timeoutMs
      });

      if (response.status < 200 || response.status >= 300) {
        return mapProviderFailure(response.status, asErrorBody(response.json));
      }

      const body = asSuccessBody(response.json);
      if (typeof body.sid !== 'string') {
        return {
          status: 'FAILED',
          provider: 'twilio_sms',
          failureCategory: 'provider_down',
          retryable: true,
          errorCode: ErrorCode.NotProviderUnavailable,
          errorMessage: 'Notification provider returned a malformed response'
        };
      }

      return {
        status: 'SENT',
        provider: 'twilio_sms',
        providerMessageId: body.sid,
        retryable: false
      };
    }
  };
};

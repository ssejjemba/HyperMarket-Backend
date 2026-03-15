import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../../errors/IaaError';

export type TwilioVerifyChannel = 'sms' | 'call' | 'whatsapp';

export type TwilioVerifyClientConfig = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  timeoutMs?: number | undefined;
};

export type StartVerificationInput = {
  phoneE164: string;
  channel: TwilioVerifyChannel;
};

export type StartVerificationResult = {
  sid: string;
  status: string;
};

export type CheckVerificationInput = {
  phoneE164: string;
  code: string;
};

export type CheckVerificationResult = {
  sid?: string | undefined;
  status: string;
  approved: boolean;
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

export type TwilioHttpClient = (request: HttpRequest) => Promise<HttpResponse>;

type TwilioVerifyClient = {
  startVerification(input: StartVerificationInput): Promise<StartVerificationResult>;
  checkVerification(input: CheckVerificationInput): Promise<CheckVerificationResult>;
};

type TwilioSuccessBody = {
  sid?: string;
  status?: string;
};

type TwilioErrorBody = {
  code?: number | string;
  message?: string;
  details?: unknown;
  more_info?: string;
  status?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

const toBasicAuthHeader = (accountSid: string, authToken: string): string => {
  const encoded = Buffer.from(`${accountSid}:${authToken}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
};

const createDefaultHttpClient = (): TwilioHttpClient => {
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

      return { status: response.status, json };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('request_timeout', { cause: error });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toErrorBody = (value: unknown): TwilioErrorBody => {
  if (isObjectRecord(value) === false) {
    return {};
  }

  return value;
};

const toSuccessBody = (value: unknown): TwilioSuccessBody => {
  if (isObjectRecord(value) === false) {
    return {};
  }

  return value;
};

const isInvalidPhoneError = (status: number, body: TwilioErrorBody): boolean => {
  if (status !== 400) {
    return false;
  }

  const message = typeof body.message === 'string' ? body.message.toLowerCase() : '';
  return (
    message.includes('phone') ||
    message.includes('e.164') ||
    message.includes('e164') ||
    message.includes('"to"') ||
    message.includes("'to'")
  );
};

const mapProviderError = (status: number, body: TwilioErrorBody): never => {
  if (isInvalidPhoneError(status, body)) {
    throw new IaaError({
      code: ErrorCode.AuthInvalidPhoneFormat,
      message: 'Phone number must be a valid E.164 number'
    });
  }

  if (status === 401 || status === 403) {
    throw new IaaError({
      code: ErrorCode.AuthProviderAuthFailed,
      message: 'OTP provider authentication failed'
    });
  }

  if (status === 429) {
    throw new IaaError({
      code: ErrorCode.AuthProviderRateLimited,
      message: 'OTP provider rate limit exceeded'
    });
  }

  throw new IaaError({
    code: ErrorCode.AuthProviderUnavailable,
    message: 'OTP provider is unavailable'
  });
};

const mapNetworkError = (error: unknown): never => {
  if (IaaError.is(error)) {
    throw error;
  }

  throw new IaaError({
    code: ErrorCode.AuthProviderUnavailable,
    message: 'OTP provider is unavailable',
    cause: error
  });
};

export const createTwilioVerifyClient = (
  config: TwilioVerifyClientConfig,
  deps: { httpClient?: TwilioHttpClient | undefined } = {}
): TwilioVerifyClient => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const httpClient = deps.httpClient ?? createDefaultHttpClient();
  const baseUrl = `https://verify.twilio.com/v2/Services/${config.serviceSid}`;
  const authHeader = toBasicAuthHeader(config.accountSid, config.authToken);

  const postForm = async (path: string, form: URLSearchParams): Promise<TwilioSuccessBody> => {
    try {
      const response = await httpClient({
        method: 'POST',
        url: `${baseUrl}${path}`,
        headers: {
          authorization: authHeader,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: form.toString(),
        timeoutMs
      });

      if (response.status < 200 || response.status >= 300) {
        mapProviderError(response.status, toErrorBody(response.json));
      }

      return toSuccessBody(response.json);
    } catch (error) {
      return mapNetworkError(error);
    }
  };

  return {
    async startVerification(input: StartVerificationInput): Promise<StartVerificationResult> {
      const body = await postForm(
        '/Verifications',
        new URLSearchParams({
          To: input.phoneE164,
          Channel: input.channel
        })
      );

      if (typeof body.sid !== 'string' || typeof body.status !== 'string') {
        throw new IaaError({
          code: ErrorCode.AuthProviderUnavailable,
          message: 'OTP provider is unavailable'
        });
      }

      return { sid: body.sid, status: body.status };
    },

    async checkVerification(input: CheckVerificationInput): Promise<CheckVerificationResult> {
      const body = await postForm(
        '/VerificationCheck',
        new URLSearchParams({
          To: input.phoneE164,
          Code: input.code
        })
      );

      if (typeof body.status !== 'string') {
        throw new IaaError({
          code: ErrorCode.AuthProviderUnavailable,
          message: 'OTP provider is unavailable'
        });
      }

      return {
        sid: typeof body.sid === 'string' ? body.sid : undefined,
        status: body.status,
        approved: body.status === 'approved'
      };
    }
  };
};

export type { TwilioVerifyClient };

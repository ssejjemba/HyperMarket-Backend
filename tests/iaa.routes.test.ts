import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildIaaTestServer } from '@hypermarket/modules/iaa/testkit';

type ErrorEnvelope = {
  request_id: string;
  error_code: string;
  message: string;
};

describe('IAA routes', () => {
  let server: Awaited<ReturnType<typeof buildIaaTestServer>>;

  beforeAll(async () => {
    server = await buildIaaTestServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /auth/otp/request', () => {
    it('returns 501 with not_implemented error envelope for a valid payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: { phone: '+256712345678' }
      });

      expect(response.statusCode).toBe(501);
      const body = response.json<ErrorEnvelope>();
      expect(typeof body.request_id).toBe('string');
      expect(body.error_code).toBe('not_implemented');
    });

    it('returns 400 with validation_failed for a missing phone', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorEnvelope>();
      expect(typeof body.request_id).toBe('string');
      expect(body.error_code).toBe('validation_failed');
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('returns 501 with not_implemented error envelope for a valid payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { phone: '+256712345678', code: '123456' }
      });

      expect(response.statusCode).toBe(501);
      const body = response.json<ErrorEnvelope>();
      expect(typeof body.request_id).toBe('string');
      expect(body.error_code).toBe('not_implemented');
    });
  });

  describe('GET /auth/session', () => {
    it('returns 501 with not_implemented error envelope', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/session'
      });

      expect(response.statusCode).toBe(501);
      const body = response.json<ErrorEnvelope>();
      expect(typeof body.request_id).toBe('string');
      expect(body.error_code).toBe('not_implemented');
    });
  });
});

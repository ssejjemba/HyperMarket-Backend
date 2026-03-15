import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import {
  buildIaaApiTestServer,
  buildIaaStubTestServer,
  TEST_JWT_SECRET
} from '@hypermarket/modules/iaa/testkit';
import { IaaError, createTokenSigner } from '@hypermarket/modules/iaa';
import type { OtpVerificationProvider } from '@hypermarket/modules/iaa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ErrorEnvelope = {
  request_id: string;
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
};

const expectErrorEnvelope = (body: ErrorEnvelope, errorCode: string): void => {
  expect(typeof body.request_id).toBe('string');
  expect(body.request_id.length).toBeGreaterThan(0);
  expect(body.error_code).toBe(errorCode);
  expect(typeof body.message).toBe('string');
  expect(body.message.length).toBeGreaterThan(0);
};

const VALID_CODE = '123456';

// ---------------------------------------------------------------------------
// Schema validation tests — no DB required
// ---------------------------------------------------------------------------

describe('IAA routes — schema validation (no DB)', () => {
  let server: Awaited<ReturnType<typeof buildIaaStubTestServer>>['server'];
  let tokenSigner: Awaited<ReturnType<typeof buildIaaStubTestServer>>['tokenSigner'];

  beforeAll(async () => {
    const result = await buildIaaStubTestServer();
    server = result.server;
    tokenSigner = result.tokenSigner;
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // -------------------------------------------------------------------------
  // POST /auth/otp/request — validation
  // -------------------------------------------------------------------------

  it('POST /auth/otp/request with missing phone returns 400 validation_failed', async () => {
    const res = await server.inject({ method: 'POST', url: '/auth/otp/request', payload: {} });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.ValidationFailed);
  });

  it('POST /auth/otp/request with phone too short returns 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+1' }
    });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.ValidationFailed);
  });

  // -------------------------------------------------------------------------
  // POST /auth/otp/verify — validation
  // -------------------------------------------------------------------------

  it('POST /auth/otp/verify with missing challenge_id returns 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phone: '+256712345678', code: '123456' }
    });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.ValidationFailed);
  });

  it('POST /auth/otp/verify with non-UUID challenge_id returns 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id: 'not-a-uuid', phone: '+256712345678', code: '123456' }
    });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.ValidationFailed);
  });

  it('POST /auth/otp/verify with code wrong length returns 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        challenge_id: '00000000-0000-0000-0000-000000000000',
        phone: '+256712345678',
        code: '12345' // 5 digits — must be 6
      }
    });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.ValidationFailed);
  });

  // -------------------------------------------------------------------------
  // GET /auth/session — token validation (pure JWT, no DB)
  // -------------------------------------------------------------------------

  it('GET /auth/session without Authorization header returns 401 auth_missing_token', async () => {
    const res = await server.inject({ method: 'GET', url: '/auth/session' });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthMissingToken);
  });

  it('GET /auth/session with malformed bearer returns 401 auth_invalid_token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: 'Bearer not.a.jwt' }
    });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthInvalidToken);
  });

  it('GET /auth/session with expired token returns 401 auth_session_expired', async () => {
    // Sign a token with a -1s TTL (already expired)
    const expiredSigner = createTokenSigner({ secret: TEST_JWT_SECRET, ttlSeconds: -1 });
    const { token } = await expiredSigner.sign('user-expired', 'stub-expired-session');
    const res = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthSessionExpired);
  });

  it('GET /auth/session with valid token returns 200 with user_id', async () => {
    const { token } = await tokenSigner.sign('user-session-ok', 'stub-session-ok');
    const res = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ user_id: string; memberships: unknown[] }>();
    expect(body.user_id).toBe('user-session-ok');
    expect(Array.isArray(body.memberships)).toBe(true);
  });

  it('GET /auth/session with wrong secret returns 401 auth_invalid_token', async () => {
    const wrongSigner = createTokenSigner({
      secret: 'completely-different-secret-1234567',
      ttlSeconds: 3600
    });
    const { token } = await wrongSigner.sign('user-abc', 'stub-session-wrong-secret');
    const res = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(401);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthInvalidToken);
  });
});

// ---------------------------------------------------------------------------
// OTP flow tests — require a real DB
// ---------------------------------------------------------------------------

const dbAvailable = await canConnectDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

flowSuite('IAA routes — OTP flows (real DB)', () => {
  let server: Awaited<ReturnType<typeof buildIaaApiTestServer>>['server'];
  let otpRepo: Awaited<ReturnType<typeof buildIaaApiTestServer>>['otpRepo'];
  let sessionRepo: Awaited<ReturnType<typeof buildIaaApiTestServer>>['sessionRepo'];
  let tokenSignerReal: Awaited<ReturnType<typeof buildIaaApiTestServer>>['tokenSigner'];
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeEach(async () => {
    ctx = await createTestContext();
    await ctx.db.deleteFrom('auth_otps').execute();
    await ctx.db.deleteFrom('sessions').execute();
    await ctx.db.deleteFrom('audit_events').execute();
    await ctx.db.deleteFrom('users').where('phone_e164', 'like', '+25671299%').execute();

    const built = await buildIaaApiTestServer({ db: ctx.db });
    server = built.server;
    otpRepo = built.otpRepo;
    sessionRepo = built.sessionRepo;
    tokenSignerReal = built.tokenSigner;
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    await ctx.destroy();
  });

  // -------------------------------------------------------------------------
  // POST /auth/otp/request — success
  // -------------------------------------------------------------------------

  it('POST /auth/otp/request with valid E.164 phone returns 200 with challenge_id', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+256712990001' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      challenge_id: string;
      expires_at: string;
      resend_after_seconds: number;
    }>();
    expect(typeof body.challenge_id).toBe('string');
    expect(body.challenge_id.length).toBeGreaterThan(0);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(body.resend_after_seconds).toBeGreaterThan(0);

    const challenge = await otpRepo.getChallengeById(body.challenge_id);
    expect(challenge).not.toBeNull();
    expect(challenge?.phoneE164).toBe('+256712990001');
    expect(challenge?.codeHash).toBeNull();
  });

  it('POST /auth/otp/request with invalid E.164 returns 400 auth_invalid_phone_format', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '0712345678' } // missing + prefix
    });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthInvalidPhoneFormat);
  });

  // -------------------------------------------------------------------------
  // POST /auth/otp/verify — error paths
  // -------------------------------------------------------------------------

  it('POST /auth/otp/verify with unknown challenge_id returns 404 auth_challenge_not_found', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        challenge_id: '00000000-0000-0000-0000-000000000000',
        phone: '+256712990001',
        code: VALID_CODE
      }
    });
    expect(res.statusCode).toBe(404);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthChallengeNotFound);
  });

  it('POST /auth/otp/verify with invalid phone returns 400 auth_invalid_phone_format', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        challenge_id: '00000000-0000-0000-0000-000000000000',
        phone: '0712990001',
        code: VALID_CODE
      }
    });
    expect(res.statusCode).toBe(400);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthInvalidPhoneFormat);
  });

  it('POST /auth/otp/verify with expired challenge returns 422 auth_challenge_expired', async () => {
    const expired = await otpRepo.createChallenge({
      phoneE164: '+256712990001',
      codeHash: 'any',
      expiresAt: new Date(Date.now() - 1000),
      maxAttempts: 3,
      lastSentAt: new Date()
    });

    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        challenge_id: expired.id,
        phone: '+256712990001',
        code: '123456'
      }
    });
    expect(res.statusCode).toBe(422);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthChallengeExpired);
  });

  it('POST /auth/otp/verify with wrong code returns 422 auth_otp_invalid with remainingAttempts', async () => {
    // First request an OTP so a valid challenge exists
    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+256712990002' }
    });
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();

    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone: '+256712990002', code: '000000' }
    });
    expect(res.statusCode).toBe(422);
    const body = res.json<ErrorEnvelope>();
    expectErrorEnvelope(body, ErrorCode.AuthOtpInvalid);
    expect(typeof body.details?.['remainingAttempts']).toBe('number');
  });

  it('POST /auth/otp/verify with phone mismatch returns 422 auth_challenge_phone_mismatch', async () => {
    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+256712990003' }
    });
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();

    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone: '+256712990004', code: VALID_CODE }
    });
    expect(res.statusCode).toBe(422);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthChallengePhoneMismatch);
  });

  it('POST /auth/otp/verify with a locked challenge returns 429 auth_challenge_locked', async () => {
    const phone = '+256712990004';

    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();

    for (let i = 0; i < 3; i++) {
      const invalidRes = await server.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { challenge_id, phone, code: '000000' }
      });
      expect(invalidRes.statusCode).toBe(422);
      expectErrorEnvelope(invalidRes.json<ErrorEnvelope>(), ErrorCode.AuthOtpInvalid);
    }

    const lockedRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: '000000' }
    });
    expect(lockedRes.statusCode).toBe(429);
    expectErrorEnvelope(lockedRes.json<ErrorEnvelope>(), ErrorCode.AuthChallengeLocked);
  });

  // -------------------------------------------------------------------------
  // Full happy path: request → verify → session
  // -------------------------------------------------------------------------

  it('full OTP flow: request → verify → returns access_token and user_id', async () => {
    const phone = '+256712990005';

    // 1. Request OTP
    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    expect(reqRes.statusCode).toBe(200);
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();

    // 2. Verify OTP
    const verRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: VALID_CODE }
    });
    expect(verRes.statusCode).toBe(200);
    const verBody = verRes.json<{
      access_token: string;
      expires_at: string;
      user_id: string;
      memberships: unknown[];
    }>();

    expect(typeof verBody.access_token).toBe('string');
    expect(verBody.access_token.split('.').length).toBe(3); // valid JWT
    expect(typeof verBody.user_id).toBe('string');
    expect(Array.isArray(verBody.memberships)).toBe(true);

    // 3. Use the token on /auth/session
    const sessRes = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${verBody.access_token}` }
    });
    expect(sessRes.statusCode).toBe(200);
    expect(sessRes.json<{ user_id: string }>().user_id).toBe(verBody.user_id);
  });

  it('POST /auth/otp/verify with invalid OTP does not create a user', async () => {
    const phone = '+256712990007';

    const before = await ctx.db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('phone_e164', '=', phone)
      .executeTakeFirstOrThrow();

    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();

    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: '000000' }
    });

    expect(res.statusCode).toBe(422);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthOtpInvalid);

    const after = await ctx.db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('phone_e164', '=', phone)
      .executeTakeFirstOrThrow();

    expect(Number(after.n)).toBe(Number(before.n));
  });

  it('POST /auth/otp/verify creates a user only on successful OTP', async () => {
    const phone = '+256712990008';

    const before = await ctx.db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('phone_e164', '=', phone)
      .executeTakeFirstOrThrow();
    expect(Number(before.n)).toBe(0);

    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: VALID_CODE }
    });

    expect(res.statusCode).toBe(200);

    const createdUsers = await ctx.db
      .selectFrom('users')
      .select(['id', 'phone_e164'])
      .where('phone_e164', '=', phone)
      .execute();

    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]?.phone_e164).toBe(phone);
  });

  it('second verify on same challenge returns 409 auth_challenge_consumed', async () => {
    const phone = '+256712990006';

    const reqRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    const { challenge_id } = reqRes.json<{ challenge_id: string }>();
    // First verify — success
    await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: VALID_CODE }
    });

    // Second verify — should fail with consumed
    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: VALID_CODE }
    });
    expect(res.statusCode).toBe(409);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthChallengeConsumed);
  });

  it('GET /auth/session returns 401 auth_session_revoked after DB revocation', async () => {
    const phone = '+256712990010';

    const requestRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    const { challenge_id } = requestRes.json<{ challenge_id: string }>();
    const verifyRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: VALID_CODE }
    });
    expect(verifyRes.statusCode).toBe(200);

    const accessToken = verifyRes.json<{ access_token: string }>().access_token;
    const claims = await tokenSignerReal.verify(accessToken);
    await sessionRepo.revokeSession(claims.sessionId);

    const sessionRes = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(sessionRes.statusCode).toBe(401);
    expectErrorEnvelope(sessionRes.json<ErrorEnvelope>(), ErrorCode.AuthSessionRevoked);
  });

  it('POST /auth/logout revokes the current session and writes an audit event', async () => {
    const phone = '+256712990012';

    const requestRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone }
    });
    const { challenge_id } = requestRes.json<{ challenge_id: string }>();

    const verifyRes = await server.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challenge_id, phone, code: VALID_CODE }
    });
    expect(verifyRes.statusCode).toBe(200);

    const accessToken = verifyRes.json<{ access_token: string }>().access_token;

    const logoutRes = await server.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json()).toEqual({ success: true });

    const sessionRes = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(sessionRes.statusCode).toBe(401);
    expectErrorEnvelope(sessionRes.json<ErrorEnvelope>(), ErrorCode.AuthSessionRevoked);

    const auditRows = await ctx.db
      .selectFrom('audit_events')
      .select(['action', 'target_id'])
      .where('action', '=', 'auth.session.revoked')
      .orderBy('created_at', 'desc')
      .execute();

    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('POST /auth/logout-all revokes all sessions for the user and writes an audit event', async () => {
    const phone = '+256712990013';

    const issueSession = async (): Promise<string> => {
      const requestRes = await server.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: { phone }
      });
      const { challenge_id } = requestRes.json<{ challenge_id: string }>();

      const verifyRes = await server.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { challenge_id, phone, code: VALID_CODE }
      });

      expect(verifyRes.statusCode).toBe(200);
      return verifyRes.json<{ access_token: string }>().access_token;
    };

    const firstToken = await issueSession();
    const secondToken = await issueSession();

    const logoutAllRes = await server.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { authorization: `Bearer ${firstToken}` }
    });
    expect(logoutAllRes.statusCode).toBe(200);
    expect(logoutAllRes.json()).toEqual({ success: true });

    const firstSessionRes = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${firstToken}` }
    });
    expect(firstSessionRes.statusCode).toBe(401);
    expectErrorEnvelope(firstSessionRes.json<ErrorEnvelope>(), ErrorCode.AuthSessionRevoked);

    const secondSessionRes = await server.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { authorization: `Bearer ${secondToken}` }
    });
    expect(secondSessionRes.statusCode).toBe(401);
    expectErrorEnvelope(secondSessionRes.json<ErrorEnvelope>(), ErrorCode.AuthSessionRevoked);

    const revokedSessions = await ctx.db
      .selectFrom('sessions')
      .select(['id', 'revoked_at'])
      .where('revoked_at', 'is not', null)
      .execute();
    expect(revokedSessions.length).toBeGreaterThanOrEqual(2);

    const auditRows = await ctx.db
      .selectFrom('audit_events')
      .select(['action', 'target_id'])
      .where('action', '=', 'auth.session.revoked_all')
      .orderBy('created_at', 'desc')
      .execute();

    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('POST /auth/otp/request returns 503 auth_provider_unavailable when the provider is down', async () => {
    await server.close();

    const providerDown: OtpVerificationProvider = {
      startVerification: async () => {
        throw new IaaError({
          code: ErrorCode.AuthProviderUnavailable,
          message: 'OTP provider is unavailable'
        });
      },
      checkVerification: async () => ({ approved: false, provider: 'test' })
    };

    const built = await buildIaaApiTestServer({
      db: ctx.db,
      verificationProvider: providerDown
    });
    server = built.server;
    otpRepo = built.otpRepo;
    sessionRepo = built.sessionRepo;
    tokenSignerReal = built.tokenSigner;
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+256712990011' }
    });

    expect(res.statusCode).toBe(503);
    expectErrorEnvelope(res.json<ErrorEnvelope>(), ErrorCode.AuthProviderUnavailable);
  });
});

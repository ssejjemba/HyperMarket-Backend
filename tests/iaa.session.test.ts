import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  IaaError,
  UserIdentity,
  createSessionService,
  createTokenSigner
} from '@hypermarket/modules/iaa';
import type { TokenSigner } from '@hypermarket/modules/iaa';
import type { SessionRepository } from '@hypermarket/modules/iaa';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECRET = 'test-jwt-secret-32-chars-minimum!!';
const TTL = 3600; // 1 hour

const makeUser = (overrides: Partial<{ id: string; status: 'active' | 'suspended' }> = {}) =>
  new UserIdentity({
    id: overrides.id ?? 'user-123',
    phoneE164: '+256712345678',
    status: overrides.status ?? 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  });

const makeSigner = (overrides: { ttlSeconds?: number } = {}) =>
  createTokenSigner({ secret: SECRET, ttlSeconds: overrides.ttlSeconds ?? TTL });

const makeRepo = (): SessionRepository => ({
  createSession: async (userId, tokenHash, expiresAt) => ({
    id: 'session-123',
    userId,
    tokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: new Date()
  }),
  getSessionById: async (sessionId) => ({
    id: sessionId,
    userId: 'user-123',
    tokenHash: '',
    expiresAt: new Date(Date.now() + TTL * 1000),
    revokedAt: null,
    createdAt: new Date()
  }),
  revokeSession: async () => undefined,
  revokeAllForUser: async () => undefined
});

const makeService = (signer: TokenSigner, repo: SessionRepository = makeRepo()) =>
  createSessionService({ signer, repo, ttlSeconds: TTL });

const tamperTokenPayload = (token: string): string => {
  const [header, payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as {
    sub: string;
  };
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...decoded, sub: `${decoded.sub}-tampered` })
  ).toString('base64url');

  return [header, tamperedPayload, signature].join('.');
};

// ---------------------------------------------------------------------------
// TokenSigner
// ---------------------------------------------------------------------------

describe('TokenSigner', () => {
  it('sign produces a non-empty JWT string', async () => {
    const signer = makeSigner();
    const { token } = await signer.sign('user-abc', 'session-abc');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // header.payload.signature
  });

  it('sign returns expiresAt roughly ttl seconds in the future', async () => {
    const signer = makeSigner({ ttlSeconds: 600 });
    const before = Date.now();
    const { expiresAt } = await signer.sign('user-abc', 'session-abc');
    const after = Date.now();

    const minExpected = before + 599_000;
    const maxExpected = after + 601_000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(minExpected);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpected);
  });

  it('verify round-trips a signed token and returns correct userId', async () => {
    const signer = makeSigner();
    const { token } = await signer.sign('user-xyz', 'session-xyz');
    const claims = await signer.verify(token);
    expect(claims.userId).toBe('user-xyz');
    expect(claims.sessionId).toBe('session-xyz');
  });

  it('sign includes session_id in the token claims', async () => {
    const signer = makeSigner();
    const { token } = await signer.sign('user-session', 'session-claim-1');

    const claims = await signer.verify(token);
    expect(claims.sessionId).toBe('session-claim-1');
  });

  it('verify returns correct issuedAt and expiresAt', async () => {
    const signer = makeSigner({ ttlSeconds: 300 });
    const { token } = await signer.sign('u1', 'session-u1');
    const claims = await signer.verify(token);

    expect(claims.issuedAt).toBeInstanceOf(Date);
    expect(claims.expiresAt).toBeInstanceOf(Date);
    // expiresAt is ~300s after issuedAt
    const delta = (claims.expiresAt.getTime() - claims.issuedAt.getTime()) / 1000;
    expect(delta).toBeGreaterThanOrEqual(299);
    expect(delta).toBeLessThanOrEqual(301);
  });

  it('tampered signature throws AUTH_INVALID_TOKEN', async () => {
    const signer = makeSigner();
    const { token } = await signer.sign('user-abc', 'session-tampered');
    const tampered = tamperTokenPayload(token);

    let thrown: unknown;
    try {
      await signer.verify(tampered);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidToken);
  });

  it('token signed with a different secret throws AUTH_INVALID_TOKEN', async () => {
    const signerA = makeSigner();
    const signerB = createTokenSigner({
      secret: 'completely-different-secret!!!',
      ttlSeconds: TTL
    });

    const { token } = await signerA.sign('user-abc', 'session-abc');

    let thrown: unknown;
    try {
      await signerB.verify(token);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidToken);
  });

  it('expired token throws AUTH_SESSION_EXPIRED', async () => {
    // ttl of 1 second; we fake expiry by using negative ttl equivalent via jose's
    // setExpirationTime — simplest: sign with ttl=1, wait, then verify.
    // Instead, use jose directly to produce an already-expired token.
    const expiredSigner = createTokenSigner({ secret: SECRET, ttlSeconds: -10 });
    const { token } = await expiredSigner.sign('user-abc', 'session-expired');

    let thrown: unknown;
    try {
      await makeSigner().verify(token);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthSessionExpired);
  });

  it('malformed string throws AUTH_INVALID_TOKEN', async () => {
    let thrown: unknown;
    try {
      await makeSigner().verify('not.a.jwt');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidToken);
  });
});

// ---------------------------------------------------------------------------
// SessionService.issueSession
// ---------------------------------------------------------------------------

describe('SessionService.issueSession', () => {
  it('returns accessToken and expiresAt for an active user', async () => {
    const service = makeService(makeSigner());
    const result = await service.issueSession(makeUser());

    expect(typeof result.accessToken).toBe('string');
    expect(result.accessToken.split('.').length).toBe(3);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('issued token validates with validateSession', async () => {
    const service = makeService(makeSigner());
    const user = makeUser({ id: 'user-999' });
    const { accessToken } = await service.issueSession(user);

    const result = await service.validateSession(accessToken);
    expect(result.userId).toBe('user-999');
    expect(result.sessionId).toBe('session-123');
  });

  it('wraps unexpected signer errors as AUTH_SESSION_ISSUE_FAILED', async () => {
    const brokenSigner: TokenSigner = {
      sign: async () => {
        throw new Error('crypto hardware failure');
      },
      verify: async () => {
        throw new Error('unreachable');
      }
    };

    const service = makeService(brokenSigner);
    let thrown: unknown;
    try {
      await service.issueSession(makeUser());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthSessionIssueFailed);
  });
});

// ---------------------------------------------------------------------------
// SessionService.validateSession
// ---------------------------------------------------------------------------

describe('SessionService.validateSession', () => {
  it('undefined token throws AUTH_MISSING_TOKEN', async () => {
    const service = makeService(makeSigner());
    let thrown: unknown;
    try {
      await service.validateSession(undefined);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthMissingToken);
  });

  it('null token throws AUTH_MISSING_TOKEN', async () => {
    const service = makeService(makeSigner());
    let thrown: unknown;
    try {
      await service.validateSession(null);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthMissingToken);
  });

  it('empty string token throws AUTH_MISSING_TOKEN', async () => {
    const service = makeService(makeSigner());
    let thrown: unknown;
    try {
      await service.validateSession('   ');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthMissingToken);
  });

  it('tampered token throws AUTH_INVALID_TOKEN', async () => {
    const signer = makeSigner();
    const service = makeService(signer);
    const { token } = await signer.sign('user-abc', 'session-abc');

    let thrown: unknown;
    try {
      await service.validateSession(tamperTokenPayload(token));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidToken);
  });

  it('expired token throws AUTH_SESSION_EXPIRED', async () => {
    const expiredSigner = createTokenSigner({ secret: SECRET, ttlSeconds: -10 });
    const service = makeService(makeSigner());
    const { token } = await expiredSigner.sign('user-abc', 'session-expired');

    let thrown: unknown;
    try {
      await service.validateSession(token);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthSessionExpired);
  });

  it('valid token returns correct userId', async () => {
    const service = makeService(makeSigner());
    const { token } = await makeSigner().sign('user-444', 'session-444');
    const result = await service.validateSession(token);
    expect(result.userId).toBe('user-444');
  });

  it('revoked session throws AUTH_SESSION_REVOKED', async () => {
    const signer = makeSigner();
    const repo: SessionRepository = {
      ...makeRepo(),
      getSessionById: async (sessionId) => ({
        id: sessionId,
        userId: 'user-123',
        tokenHash: '',
        expiresAt: new Date(Date.now() + TTL * 1000),
        revokedAt: new Date(),
        createdAt: new Date()
      })
    };
    const service = makeService(signer, repo);
    const { token } = await signer.sign('user-123', 'session-revoked');

    let thrown: unknown;
    try {
      await service.validateSession(token);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthSessionRevoked);
  });

  it('missing session row throws AUTH_SESSION_NOT_FOUND', async () => {
    const signer = makeSigner();
    const repo: SessionRepository = {
      ...makeRepo(),
      getSessionById: async () => null
    };
    const service = makeService(signer, repo);
    const { token } = await signer.sign('user-123', 'session-missing');

    let thrown: unknown;
    try {
      await service.validateSession(token);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthSessionNotFound);
  });
});

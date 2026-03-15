import crypto from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';
import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

export type SessionPayload = {
  sub: string;
  phone: string;
  jti: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

type SessionConfig = {
  jwtSecret: string;
  jwtIssuer?: string | undefined;
  ttlSeconds: number;
};

const toSecret = (secret: string): Uint8Array => {
  return new TextEncoder().encode(secret);
};

export const createSessionService = (db: Kysely<DatabaseSchema>, config: SessionConfig) => {
  const issueSession = async (
    userId: string,
    phone: string
  ): Promise<{ token: string; session: SessionRecord }> => {
    const tokenHash = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + config.ttlSeconds;

    const jwt = await new SignJWT({ phone })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setJti(tokenHash)
      .setIssuer(config.jwtIssuer ?? 'hypermarket')
      .sign(toSecret(config.jwtSecret));

    const expiresAt = new Date(exp * 1000);

    const row = await db
      .insertInto('sessions')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: sql`now()`,
        revoked_at: null
      })
      .returning(['id', 'user_id', 'token_hash', 'expires_at'])
      .executeTakeFirstOrThrow();

    return {
      token: jwt,
      session: {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at
      }
    };
  };

  const verifyToken = async (token: string): Promise<SessionPayload> => {
    const { payload } = await jwtVerify(token, toSecret(config.jwtSecret), {
      issuer: config.jwtIssuer ?? 'hypermarket'
    });

    return {
      sub: String(payload.sub ?? ''),
      phone: String(payload.phone ?? ''),
      jti: String(payload.jti ?? '')
    };
  };

  return {
    issueSession,
    verifyToken
  };
};

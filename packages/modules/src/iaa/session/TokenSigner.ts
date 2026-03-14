import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';

import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../errors/IaaError';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenClaims = {
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type TokenSignerConfig = {
  secret: string;
  ttlSeconds: number;
  issuer?: string | undefined;
};

export type TokenSigner = {
  /**
   * Sign a JWT for the given user ID.
   * Never log the returned token — it is a bearer credential.
   */
  sign(userId: string): Promise<{ token: string; expiresAt: Date }>;

  /**
   * Verify and decode a JWT.
   * Throws typed IaaErrors for expired / invalid tokens.
   * Callers are responsible for the missing-token guard.
   */
  verify(token: string): Promise<TokenClaims>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createTokenSigner = (config: TokenSignerConfig): TokenSigner => {
  const secretBytes = new TextEncoder().encode(config.secret);

  return {
    async sign(userId: string): Promise<{ token: string; expiresAt: Date }> {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + config.ttlSeconds * 1000);

      let builder = new SignJWT({ sub: userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresAt);

      if (config.issuer !== undefined) {
        builder = builder.setIssuer(config.issuer);
      }

      const token = await builder.sign(secretBytes);
      return { token, expiresAt };
    },

    async verify(token: string): Promise<TokenClaims> {
      try {
        const { payload } = await jwtVerify(token, secretBytes, {
          ...(config.issuer !== undefined ? { issuer: config.issuer } : {})
        });

        // Both `iat` and `exp` are guaranteed to be numbers when set by our signer.
        return {
          userId: payload.sub as string,
          issuedAt: new Date((payload.iat as number) * 1000),
          expiresAt: new Date((payload.exp as number) * 1000)
        };
      } catch (e) {
        if (e instanceof joseErrors.JWTExpired) {
          throw new IaaError({
            code: ErrorCode.AuthSessionExpired,
            message: 'Session has expired',
            cause: e
          });
        }
        if (IaaError.is(e)) throw e;
        throw new IaaError({
          code: ErrorCode.AuthInvalidToken,
          message: 'Invalid session token',
          cause: e
        });
      }
    }
  };
};

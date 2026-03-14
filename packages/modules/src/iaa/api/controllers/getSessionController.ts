import type { FastifyRequest } from 'fastify';

import type { MembershipReader } from '../../membership/MembershipReader';
import type { SessionService } from '../../session/SessionService';

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

type MembershipItem = {
  tenant_id: string;
  role: string;
  status: string;
};

export type GetSessionResponse = {
  user_id: string;
  memberships: MembershipItem[];
};

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export const makeGetSessionHandler =
  (sessionService: SessionService, membershipReader: MembershipReader) =>
  async (request: FastifyRequest): Promise<GetSessionResponse> => {
    // Extract Bearer token — never log it.
    const authHeader = request.headers.authorization;
    const token =
      authHeader !== undefined && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;

    // validateSession throws AUTH_MISSING_TOKEN / AUTH_INVALID_TOKEN / AUTH_SESSION_EXPIRED.
    const { userId } = await sessionService.validateSession(token);

    const memberships = await membershipReader.listMemberships(userId);

    return {
      user_id: userId,
      memberships: memberships.map((m) => ({
        tenant_id: m.tenantId,
        role: m.role,
        status: m.status
      }))
    };
  };

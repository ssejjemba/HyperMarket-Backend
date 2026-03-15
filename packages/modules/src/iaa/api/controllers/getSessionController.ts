import type { FastifyRequest } from 'fastify';

import type { MembershipReader } from '../../membership/MembershipReader';
import type { IaaMetrics } from '../../observability/iaaMetrics';
import type { SessionService } from '../../session/SessionService';
import { extractBearerToken } from './extractBearerToken';

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
  (sessionService: SessionService, membershipReader: MembershipReader, metrics?: IaaMetrics) =>
  async (request: FastifyRequest): Promise<GetSessionResponse> => {
    const token = extractBearerToken(request);

    try {
      // validateSession throws AUTH_MISSING_TOKEN / AUTH_INVALID_TOKEN / AUTH_SESSION_EXPIRED.
      const { userId } = await sessionService.validateSession(token);

      const memberships = await membershipReader.listMemberships(userId);

      metrics?.sessionValidateTotal({ outcome: 'success' });

      return {
        user_id: userId,
        memberships: memberships.map((m) => ({
          tenant_id: m.tenantId,
          role: m.role,
          status: m.status
        }))
      };
    } catch (e) {
      metrics?.sessionValidateTotal({
        outcome: 'failure',
        error_code: (e as { code?: string }).code
      });
      throw e;
    }
  };

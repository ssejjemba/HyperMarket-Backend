import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type TenancyErrorCode =
  | ErrorCode.TenantSlugInvalid
  | ErrorCode.TenantSlugTaken
  | ErrorCode.TenantNotFound
  | ErrorCode.TenantSuspended
  | ErrorCode.TenantArchived
  | ErrorCode.TenantDomainInvalid
  | ErrorCode.TenantDomainTaken
  | ErrorCode.TenantDomainNotFound
  | ErrorCode.TenantSettingsInvalid
  | ErrorCode.TenantMembershipExists
  | ErrorCode.TenantMembershipNotFound
  | ErrorCode.TenantMembershipRevoked
  | ErrorCode.TenantMembershipRoleInvalid
  | ErrorCode.TenantMemberSelfRevokeForbidden
  | ErrorCode.TenantLastOwnerRevokeForbidden
  | ErrorCode.TenantLastOwnerRoleChangeForbidden
  | ErrorCode.TenantMemberTargetNotFound
  | ErrorCode.TenantMemberAlreadyRevoked
  | ErrorCode.TenantAccessForbidden
  | ErrorCode.TenantDbFailure;

type TenancyErrorParams = {
  code: TenancyErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class TenancyError extends AppError {
  declare readonly code: TenancyErrorCode;

  constructor(params: TenancyErrorParams) {
    super(params);
    this.name = 'TenancyError';
  }

  static is(error: unknown): error is TenancyError {
    return error instanceof TenancyError;
  }
}

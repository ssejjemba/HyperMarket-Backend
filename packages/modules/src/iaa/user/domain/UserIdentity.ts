import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../../errors/IaaError';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'suspended';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface UserIdentityProps {
  id: string;
  phoneE164: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * Pure domain entity representing an authenticated identity.
 *
 * Carries no OTP logic — it is the result of a completed OTP verification.
 */
export class UserIdentity {
  readonly id: string;
  readonly phoneE164: string;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserIdentityProps) {
    this.id = props.id;
    this.phoneE164 = props.phoneE164;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Throws AUTH_USER_SUSPENDED when the account is not active.
   */
  assertActive(): void {
    if (this.status !== 'active') {
      throw new IaaError({
        code: ErrorCode.AuthUserSuspended,
        message: 'This account has been suspended'
      });
    }
  }
}

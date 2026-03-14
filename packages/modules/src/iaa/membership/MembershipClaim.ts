// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type MembershipStatus = 'active' | 'revoked';

// ---------------------------------------------------------------------------
// Value object
// ---------------------------------------------------------------------------

/**
 * Immutable snapshot of a user's membership in a tenant at the time of
 * authentication. Used to populate session context and enforce access rules.
 */
export class MembershipClaim {
  readonly tenantId: string;
  readonly role: string;
  readonly status: MembershipStatus;

  constructor(props: { tenantId: string; role: string; status: MembershipStatus }) {
    this.tenantId = props.tenantId;
    this.role = props.role;
    this.status = props.status;
  }

  get isActive(): boolean {
    return this.status === 'active';
  }
}

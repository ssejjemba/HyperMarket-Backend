import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { TenancyError } from '@hypermarket/modules/tenancy';

import {
  createTenantMembershipRequestSchema,
  parseCreateTenantMembershipInput,
  parseTenantMembershipUserParams,
  parseUpdateTenantMembershipRoleInput,
  tenantMembershipUserParamsSchema,
  updateTenantMembershipRoleRequestSchema
} from '../packages/modules/src/tenancy/api/schemas/tenantSchemas';

describe('TEN membership mutation schemas', () => {
  it('accepts a Ugandan phone target and valid role for member creation', () => {
    const parsed = createTenantMembershipRequestSchema.parse({
      phone_e164: '+256712345678',
      role: 'manager'
    });

    expect(parsed).toEqual({
      phoneE164: '+256712345678',
      role: 'manager'
    });
  });

  it('rejects unsupported phone countries for member creation', () => {
    expect(() =>
      parseCreateTenantMembershipInput({
        phone_e164: '+14155550123',
        role: 'owner'
      })
    ).toThrowError(
      new TenancyError({
        code: ErrorCode.TenantMemberTargetNotFound,
        message: 'phone_e164 must be a valid Ugandan phone number'
      })
    );
  });

  it('rejects invalid member roles with tenant_membership_role_invalid', () => {
    expect(() =>
      parseCreateTenantMembershipInput({
        phone_e164: '+256712345678',
        role: 'cashier'
      })
    ).toThrowError(
      new TenancyError({
        code: ErrorCode.TenantMembershipRoleInvalid,
        message: 'role must be one of owner, manager, staff'
      })
    );
  });

  it('accepts tenant/user params for revoke and role change routes', () => {
    const parsed = tenantMembershipUserParamsSchema.parse({
      tenantId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002'
    });

    expect(parsed).toEqual({
      tenantId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002'
    });
  });

  it('rejects invalid target user params with tenant_member_target_not_found', () => {
    expect(() =>
      parseTenantMembershipUserParams({
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: 'bad-user-id'
      })
    ).toThrowError(
      new TenancyError({
        code: ErrorCode.TenantMemberTargetNotFound,
        message: 'userId must be a valid UUID'
      })
    );
  });

  it('accepts valid membership role updates', () => {
    const parsed = updateTenantMembershipRoleRequestSchema.parse({
      role: 'staff'
    });

    expect(parsed).toEqual({ role: 'staff' });
  });

  it('rejects invalid membership role updates with tenant_membership_role_invalid', () => {
    expect(() =>
      parseUpdateTenantMembershipRoleInput({
        role: 'viewer'
      })
    ).toThrowError(
      new TenancyError({
        code: ErrorCode.TenantMembershipRoleInvalid,
        message: 'role must be one of owner, manager, staff'
      })
    );
  });
});

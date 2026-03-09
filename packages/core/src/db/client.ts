import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/**
 * Database access is restricted to repositories.
 * Application/services must depend on repository interfaces only.
 */
export type DatabaseSchema = {
  outbox_events: {
    id: string;
    event_type: string;
    tenant_id: string | null;
    correlation_id: string | null;
    actor_user_id: string | null;
    payload: Record<string, unknown>;
    occurred_at: Date;
    available_at: Date;
    dispatched_at: Date | null;
    attempts: number;
    last_error: string | null;
    created_at: Date;
  };
  idempotency_keys: {
    id: string;
    tenant_id: string;
    operation: string;
    idempotency_key: string;
    request_hash: string;
    response_ref: string | null;
    created_at: Date;
    updated_at: Date;
  };
  audit_events: {
    id: string;
    tenant_id: string;
    actor_user_id: string | null;
    action: string;
    target_type: string;
    target_id: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    request_id: string | null;
    occurred_at: Date;
    created_at: Date;
  };
  tenants: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  };
  tenant_memberships: {
    id: string;
    tenant_id: string;
    user_id: string;
    role: string;
    created_at: Date;
  };
  tenant_domains: {
    id: string;
    tenant_id: string;
    hostname: string;
    is_primary: boolean;
    created_at: Date;
  };
};

export const createDbClient = (databaseUrl: string): Kysely<DatabaseSchema> => {
  const pool = new Pool({ connectionString: databaseUrl });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool })
  });
};

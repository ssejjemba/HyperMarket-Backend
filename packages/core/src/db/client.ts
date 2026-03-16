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
    slug: string;
    business_name: string;
    status: 'active' | 'suspended' | 'archived';
    default_currency: string;
    active_config_id: string | null;
    created_at: Date;
    updated_at: Date;
  };
  tenant_memberships: {
    id: string;
    tenant_id: string;
    user_id: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    created_at: Date;
    revoked_at: Date | null;
  };
  tenant_domains: {
    id: string;
    tenant_id: string;
    domain: string;
    domain_type: 'subdomain' | 'custom';
    verification_status: 'verified' | 'pending' | 'failed';
    is_primary: boolean;
    created_at: Date;
  };
  tenant_settings: {
    tenant_id: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone_e164: string | null;
    contact_whatsapp_e164: string | null;
    social_links: Record<string, unknown>;
    business_hours: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  };
  store_configs: {
    id: string;
    tenant_id: string;
    status: 'draft' | 'active' | 'archived';
    template_id: string;
    template_version: string;
    config_version: number;
    config_payload: Record<string, unknown>;
    validation_report: Record<string, unknown> | null;
    created_by_user_id: string;
    created_at: Date;
  };
  publish_history: {
    id: string;
    tenant_id: string;
    action: 'publish' | 'rollback';
    from_config_id: string | null;
    to_config_id: string;
    actor_user_id: string;
    result: 'success' | 'failed';
    failure_reason: string | null;
    created_at: Date;
  };
  categories: {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    description: string | null;
    sort_order: number;
    is_visible: boolean;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  };
  products: {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    description: string | null;
    status: 'active' | 'draft' | 'archived';
    primary_image_asset_id: string | null;
    price_amount: number;
    compare_at_price_amount: number | null;
    currency: string;
    track_inventory: boolean;
    stock_quantity: number | null;
    sku: string | null;
    attributes: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  };
  product_variants: {
    id: string;
    tenant_id: string;
    product_id: string;
    name: string;
    sku: string | null;
    price_amount: number | null;
    stock_quantity: number | null;
    options: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  };
  product_categories: {
    tenant_id: string;
    product_id: string;
    category_id: string;
    created_at: Date;
  };
  media_assets: {
    id: string;
    tenant_id: string;
    storage_key: string;
    mime_type: string;
    byte_size: string | number;
    width: number | null;
    height: number | null;
    checksum: string | null;
    status: 'uploaded' | 'confirmed' | 'deleted';
    created_by_user_id: string | null;
    created_at: Date;
    deleted_at: Date | null;
  };
  auth_otps: {
    id: string;
    phone_e164: string;
    code_hash: string | null;
    expires_at: Date;
    attempt_count: number;
    max_attempts: number;
    status: string;
    last_sent_at: Date;
    created_at: Date;
  };
  sessions: {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    created_at: Date;
    revoked_at: Date | null;
  };
  users: {
    id: string;
    phone_e164: string;
    email: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  };
};

export const createDbClient = (databaseUrl: string): Kysely<DatabaseSchema> => {
  const pool = new Pool({ connectionString: databaseUrl });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool })
  });
};

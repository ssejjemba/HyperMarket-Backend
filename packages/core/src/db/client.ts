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
  customers: {
    id: string;
    tenant_id: string;
    full_name: string | null;
    phone_e164: string | null;
    email: string | null;
    notes: string | null;
    created_at: Date;
  };
  orders: {
    id: string;
    tenant_id: string;
    order_number: string | number;
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'PAID' | 'FAILED' | 'FULFILLED' | 'REFUNDED';
    checkout_mode: 'pay_on_delivery' | 'gateway_payment';
    currency: string;
    subtotal_amount: number;
    delivery_fee_amount: number;
    discount_amount: number;
    total_amount: number;
    customer_id: string | null;
    customer_snapshot: Record<string, unknown>;
    fulfillment_snapshot: Record<string, unknown>;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  };
  order_items: {
    id: string;
    tenant_id: string;
    order_id: string;
    product_id: string | null;
    variant_id: string | null;
    title: string;
    sku: string | null;
    quantity: number;
    unit_price_amount: number;
    line_total_amount: number;
    image_url: string | null;
    created_at: Date;
  };
  order_state_history: {
    id: string;
    tenant_id: string;
    order_id: string;
    from_status:
      | 'PENDING'
      | 'CONFIRMED'
      | 'CANCELLED'
      | 'PAID'
      | 'FAILED'
      | 'FULFILLED'
      | 'REFUNDED'
      | null;
    to_status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'PAID' | 'FAILED' | 'FULFILLED' | 'REFUNDED';
    reason: string | null;
    actor_type: 'system' | 'merchant' | 'customer';
    actor_user_id: string | null;
    created_at: Date;
  };
  payment_intents: {
    id: string;
    tenant_id: string;
    order_id: string;
    provider: string;
    method: 'mobile_money' | 'card' | 'bank';
    status:
      | 'CREATED'
      | 'PENDING_PROVIDER'
      | 'AWAITING_CUSTOMER'
      | 'SUCCEEDED'
      | 'FAILED'
      | 'EXPIRED'
      | 'CANCELLED'
      | 'REFUNDED';
    amount: number;
    currency: string;
    tx_ref: string;
    provider_reference: string | null;
    provider_transaction_id: string | null;
    customer_phone_e164: string | null;
    customer_email: string;
    network: string;
    failure_code: string | null;
    failure_message: string | null;
    created_at: Date;
    updated_at: Date;
  };
  payment_provider_events: {
    id: string;
    provider: string;
    provider_event_id: string;
    tenant_id: string | null;
    intent_id: string | null;
    order_id: string | null;
    payload: Record<string, unknown>;
    received_at: Date;
  };
  notification_jobs: {
    id: string;
    tenant_id: string;
    event_id: string;
    event_type: string;
    channel: 'whatsapp' | 'sms' | 'email';
    recipient: string;
    template_id: string;
    template_version: number;
    payload: Record<string, unknown>;
    dedupe_key: string;
    status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED_RETRYABLE' | 'DEAD';
    attempt_count: number;
    last_error_code: string | null;
    last_error_message: string | null;
    provider: string | null;
    provider_message_id: string | null;
    created_at: Date;
    updated_at: Date;
  };
  notification_delivery_attempts: {
    id: string;
    tenant_id: string;
    job_id: string;
    attempt_number: number;
    provider: string;
    result: 'success' | 'failed';
    error_code: string | null;
    error_message: string | null;
    provider_message_id: string | null;
    created_at: Date;
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

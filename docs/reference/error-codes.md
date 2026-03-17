# Error Codes

Canonical enum:

- [packages/contracts/src/errors/errorCodes.ts](../../packages/contracts/src/errors/errorCodes.ts)

## Common Shared Codes

- `validation_failed`
- `unauthorized`
- `forbidden`
- `not_found`
- `conflict`
- `internal_error`

## IAA

- `auth_invalid_phone_format`
- `auth_phone_country_not_supported`
- `auth_challenge_not_found`
- `auth_otp_invalid`
- `auth_missing_token`
- `auth_invalid_token`
- `auth_session_not_found`
- `auth_session_expired`
- `auth_session_revoked`

## TEN

- `tenant_slug_invalid`
- `tenant_slug_taken`
- `tenant_not_found`
- `tenant_domain_not_found`
- `tenant_membership_not_found`
- `tenant_membership_revoked`
- `tenant_access_forbidden`
- `tenant_settings_invalid`

## PUB

- `config_invalid_payload`
- `config_schema_mismatch`
- `config_not_found`
- `config_not_draft`
- `config_already_active`
- `publish_validation_failed`
- `revalidation_dispatch_failed`

## CAT

- `catalog_product_not_found`
- `catalog_category_not_found`
- `catalog_slug_invalid`
- `catalog_slug_taken`
- `catalog_price_invalid`
- `catalog_currency_not_supported`
- `catalog_inventory_rule_violation`
- `catalog_validation_failed`

## MED

- `media_mime_not_allowed`
- `media_file_too_large`
- `media_quota_exceeded`
- `media_upload_token_failed`
- `media_asset_not_found`
- `media_storage_key_mismatch`
- `media_confirm_failed`
- `media_delete_forbidden`
- `media_delete_failed`
- `media_validation_failed`

## FUL

- `ful_no_fulfillment_mode_enabled`
- `ful_delivery_enabled_without_zones`
- `ful_settings_invalid`
- `ful_zone_not_found`
- `ful_zone_inactive`
- `ful_zone_name_taken`
- `ful_zone_invalid`
- `ful_store_closed`
- `ful_fulfillment_selection_invalid`
- `ful_delivery_min_order_not_met`
- `ful_delivery_not_available`
- `ful_pickup_not_available`

## ORD

- `order_idempotency_conflict`
- `order_invalid_items`
- `order_product_not_found`
- `order_variant_not_found`
- `order_product_not_available`
- `order_quantity_invalid`
- `order_fulfillment_invalid`
- `order_total_mismatch_internal`
- `order_invalid_state_transition`
- `order_not_found`
- `order_validation_failed`

## PAY

- `payment_provider_config_invalid`
- `payment_provider_unavailable`
- `payment_phone_invalid`
- `payment_order_not_found`
- `payment_order_not_payable`
- `payment_intent_not_found`
- `payment_invalid_state_transition`
- `payment_webhook_signature_invalid`
- `payment_webhook_parse_failed`
- `payment_idempotency_conflict`
- `payment_reconciliation_failed`
- `payment_db_failure`
- `payment_webhook_hash_missing`
- `payment_webhook_hash_mismatch`
- `payment_provider_rejected_request`
- `payment_provider_rate_limited`
- `payment_provider_auth_failed`
- `payment_transaction_verification_failed`
- `payment_transaction_mismatch`

## NOT

- `not_template_not_found`
- `not_template_payload_invalid`
- `not_recipient_invalid`
- `not_provider_unavailable`
- `not_provider_auth_failed`
- `not_provider_rate_limited`
- `not_send_failed_retryable`
- `not_send_failed_non_retryable`
- `not_job_not_found`
- `not_job_dedupe_conflict`
- `not_db_failure`

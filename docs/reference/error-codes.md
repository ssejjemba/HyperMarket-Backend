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

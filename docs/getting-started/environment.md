# Environment Variables

Source of truth:

- [.env.example](../../.env.example)
- [packages/core/src/config/loadEnv.ts](../../packages/core/src/config/loadEnv.ts)

## Required

| Variable                    | Purpose                           |
| --------------------------- | --------------------------------- |
| `DATABASE_URL`              | Postgres connection string        |
| `REDIS_URL`                 | Redis connection string           |
| `JWT_SECRET`                | JWT signing secret                |
| `TWILIO_ACCOUNT_SID`        | Twilio Verify account SID         |
| `TWILIO_AUTH_TOKEN`         | Twilio auth token                 |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service SID         |
| `PLATFORM_ROOT_DOMAIN`      | Root domain for tenant subdomains |

## Common Optional Values

| Variable              | Default                                          |
| --------------------- | ------------------------------------------------ |
| `NODE_ENV`            | `development`                                    |
| `PORT`                | `3000`                                           |
| `LOG_LEVEL`           | `debug` outside production, `info` in production |
| `OTP_SECRET`          | falls back to `JWT_SECRET`                       |
| `OTP_TTL_SECONDS`     | `300`                                            |
| `SESSION_TTL_SECONDS` | `604800`                                         |
| `ENABLE_DEV_ROUTES`   | `false`                                          |

## Media and Asset Delivery

| Variable                       | Default                         |
| ------------------------------ | ------------------------------- |
| `MEDIA_CDN_BASE_URL`           | `http://localhost:3002/cdn`     |
| `MEDIA_UPLOAD_BASE_URL`        | `http://localhost:3002/uploads` |
| `MEDIA_UPLOAD_URL_TTL_SECONDS` | `900`                           |
| `MEDIA_MAX_FILE_BYTES`         | `5242880`                       |

## Payments and Notifications

| Variable                               | Default                       |
| -------------------------------------- | ----------------------------- |
| `PAYMENT_DEFAULT_PROVIDER`             | `flutterwave`                 |
| `PAYMENT_RECONCILIATION_STALE_MINUTES` | `10`                          |
| `FLW_SECRET_KEY`                       | unset in local example        |
| `FLW_WEBHOOK_SECRET_HASH`              | unset in local example        |
| `FLW_BASE_URL`                         | `https://api.flutterwave.com` |
| `FLW_DEFAULT_NETWORK`                  | `MTN`                         |
| `NOT_DEFAULT_PROVIDER`                 | `twilio_sms`                  |
| `NOT_DEFAULT_CHANNEL`                  | `sms`                         |
| `TWILIO_SMS_FROM`                      | `+256700000000`               |

## Public Storefront Abuse Controls

| Variable                                   | Default |
| ------------------------------------------ | ------- |
| `PUBLIC_ORDER_RATE_LIMIT_WINDOW_SECONDS`   | `60`    |
| `PUBLIC_ORDER_RATE_LIMIT_MAX`              | `20`    |
| `PUBLIC_PAYMENT_RATE_LIMIT_WINDOW_SECONDS` | `60`    |
| `PUBLIC_PAYMENT_RATE_LIMIT_MAX`            | `10`    |

## Worker-Specific

| Variable                        | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `STOREFRONT_REVALIDATION_URL`   | Worker callback target for storefront revalidation    |
| `STOREFRONT_REVALIDATION_TOKEN` | Bearer token sent to storefront revalidation endpoint |

## Notes

- `ENABLE_DEV_ROUTES=true` exposes local-only OTP inspection routes in development-oriented environments.
- The worker needs both the shared env values and the storefront revalidation values.
- The current MVP is Uganda-first, so catalog currency is locked to `UGX`.
- PAY is currently configured around Flutterwave Uganda MoMo.
- NOT currently sends SMS via Twilio and uses worker-side job dispatch only.
- Flutterwave secrets are required outside test mode when `PAYMENT_DEFAULT_PROVIDER=flutterwave`.
- Twilio SMS sender is required outside test mode when `NOT_DEFAULT_PROVIDER=twilio_sms`.

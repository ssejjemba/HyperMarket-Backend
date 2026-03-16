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

## Worker-Specific

| Variable                        | Purpose                                               |
| ------------------------------- | ----------------------------------------------------- |
| `STOREFRONT_REVALIDATION_URL`   | Worker callback target for storefront revalidation    |
| `STOREFRONT_REVALIDATION_TOKEN` | Bearer token sent to storefront revalidation endpoint |

## Notes

- `ENABLE_DEV_ROUTES=true` exposes local-only OTP inspection routes in development-oriented environments.
- The worker needs both the shared env values and the storefront revalidation values.
- The current MVP is Uganda-first, so catalog currency is locked to `UGX`.

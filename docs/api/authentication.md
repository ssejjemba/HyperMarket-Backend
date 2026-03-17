# Authentication

## OTP Request

`POST /auth/otp/request`

Request:

```json
{
  "phone": "+256712345678"
}
```

Response:

```json
{
  "challenge_id": "bfdbaf93-22c1-4c8c-b9d3-7a0a0184713b",
  "expires_at": "2026-03-16T18:00:00.000Z",
  "resend_after_seconds": 60
}
```

## OTP Verify

`POST /auth/otp/verify`

Request:

```json
{
  "challenge_id": "bfdbaf93-22c1-4c8c-b9d3-7a0a0184713b",
  "phone": "+256712345678",
  "code": "123456"
}
```

Response:

```json
{
  "access_token": "<jwt>",
  "expires_at": "2026-03-23T18:00:00.000Z",
  "user_id": "0f1f6879-cdf5-4f98-98f1-ffb514f56c6d",
  "memberships": [
    {
      "tenant_id": "4bc73e5f-288f-4be3-9f91-3cefb8c5401b",
      "role": "owner",
      "status": "active"
    }
  ]
}
```

## Session Read

`GET /auth/session`

Response:

```json
{
  "user_id": "0f1f6879-cdf5-4f98-98f1-ffb514f56c6d",
  "memberships": [
    {
      "tenant_id": "4bc73e5f-288f-4be3-9f91-3cefb8c5401b",
      "role": "owner",
      "status": "active"
    }
  ]
}
```

## Logout

- `POST /auth/logout`
- `POST /auth/logout-all`

Both require `Authorization: Bearer <access_token>`.

## Notes

- OTP auth is Uganda-first and uses the phone validation rules enforced by the IAA module.
- In development, OTP verification uses the local provider and the API may expose local-only debug routes when `ENABLE_DEV_ROUTES=true`.
- In production, OTP verification uses Twilio Verify.

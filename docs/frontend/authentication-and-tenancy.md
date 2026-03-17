# Authentication and Tenant Context

This page explains the two most important concepts for frontend integration:

- who is the user
- which tenant/store are they acting on

## Two Different Contexts

The backend has two main request contexts.

### Public storefront context

The customer is usually not authenticated.

The tenant is identified by:

- `tenantSlug` in the URL

Example:

```text
/storefront/sunrise-fresh/products
```

### Merchant dashboard context

The merchant is authenticated.

The request uses:

- bearer token for identity
- `tenantId` in the route for tenant scope

Example:

```text
GET /tenants/4bc73e5f-288f-4be3-9f91-3cefb8c5401b/products
Authorization: Bearer <access_token>
```

## Merchant Authentication Flow

The dashboard auth flow is OTP-based.

### Step 1. Request OTP

`POST /auth/otp/request`

Example request:

```json
{
  "phone": "+256712345678"
}
```

Example response:

```json
{
  "challenge_id": "bfdbaf93-22c1-4c8c-b9d3-7a0a0184713b",
  "expires_at": "2026-03-16T18:00:00.000Z",
  "resend_after_seconds": 60
}
```

Frontend use:

- store `challenge_id`
- start a resend timer using `resend_after_seconds`
- show the verification form

### Step 2. Verify OTP

`POST /auth/otp/verify`

Example request:

```json
{
  "challenge_id": "bfdbaf93-22c1-4c8c-b9d3-7a0a0184713b",
  "phone": "+256712345678",
  "code": "123456"
}
```

Example response:

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

Frontend use:

- store the `access_token`
- treat `memberships` as the source of tenant choices available to the merchant
- route the merchant into a tenant-aware dashboard flow

### Step 3. Read session later

`GET /auth/session`

Use this when:

- the app reloads
- you want to restore the logged-in merchant state
- you want to refresh memberships after login

### Step 4. Logout

Use:

- `POST /auth/logout`
- `POST /auth/logout-all`

Both require the bearer token.

## How To Model Tenant State In The Frontend

A common mistake is to mix up tenant slug and tenant ID.

Do not treat them as interchangeable.

Use this mental model:

- `tenantSlug` is for public storefront URLs
- `tenantId` is for authenticated merchant APIs

Recommended frontend state shape:

```ts
type SelectedTenant = {
  tenantId: string;
  role: 'owner' | 'manager' | 'member';
  status: 'active' | 'invited' | 'disabled';
};
```

Storefront state usually does not need `tenantId` at all unless your frontend has a special internal integration.

## Authorization Rules Frontend Engineers Should Expect

### Public routes

Public storefront routes do not need merchant auth.

### Merchant routes

Merchant routes require:

- a valid bearer token
- membership in the tenant from the route

Some mutations are more restricted than reads.

Example:

- many GET routes require tenant membership
- some destructive or operational POST routes are owner-only

Frontend implication:

- do not assume every authenticated user can see every tenant
- do not assume every authenticated user can perform every mutation

## Common UX Pattern For Multi-Tenant Dashboards

Recommended flow:

1. login with OTP
2. receive memberships
3. if there is exactly one active membership, auto-select it
4. if there are multiple, show a tenant selector
5. store the selected `tenantId` in app state
6. build tenant-aware pages and API calls from that value

## Failure Cases To Design For

### Invalid or expired token

The frontend should:

- clear local auth state if appropriate
- redirect to login
- avoid retry loops with the same invalid token

### User is authenticated but not a member of the tenant

The frontend should show:

- access denied
- or a route back to tenant selection

### Tenant slug does not exist

For storefront pages, show a clean "store not found" experience.

## Related Reference Docs

- [Authentication API](../api/authentication.md)
- [Merchant Tenancy API](../api/merchant/tenancy.md)

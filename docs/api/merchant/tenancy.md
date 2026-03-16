# Merchant Tenancy API

## Create Tenant

`POST /tenants`

Request:

```json
{
  "business_name": "Sunrise Fresh",
  "slug": "sunrise-fresh"
}
```

Response:

```json
{
  "tenant": {
    "id": "4bc73e5f-288f-4be3-9f91-3cefb8c5401b",
    "business_name": "Sunrise Fresh",
    "slug": "sunrise-fresh",
    "status": "active"
  },
  "primary_domain": "sunrise-fresh.platform.ug"
}
```

## List Tenants

`GET /tenants`

Returns the authenticated user’s tenant memberships and summaries.

## Get Tenant

`GET /tenants/:tenantId`

Requires tenant membership.

## Tenant Settings

### Get

`GET /tenants/:tenantId/settings`

### Update

`PATCH /tenants/:tenantId/settings`

Example request:

```json
{
  "contact_name": "Grace A.",
  "contact_email": "owner@sunrisefresh.ug",
  "contact_phone": "+256712345678",
  "contact_whatsapp": "+256772345678",
  "social_links": {
    "website": "https://sunrisefresh.ug",
    "instagram": "https://instagram.com/sunrisefresh"
  },
  "business_hours": {
    "monday": {
      "closed": false,
      "open": "08:00",
      "close": "20:00"
    }
  }
}
```

## Memberships

### List

`GET /tenants/:tenantId/memberships`

### Create

`POST /tenants/:tenantId/memberships`

Request:

```json
{
  "phone_e164": "+256712345678",
  "role": "manager"
}
```

### Revoke

`POST /tenants/:tenantId/memberships/:userId/revoke`

### Update Role

`PATCH /tenants/:tenantId/memberships/:userId/role`

Request:

```json
{
  "role": "staff"
}
```

## Common Tenancy Error Codes

- `tenant_slug_invalid`
- `tenant_slug_taken`
- `tenant_not_found`
- `tenant_membership_not_found`
- `tenant_membership_role_invalid`
- `tenant_settings_invalid`

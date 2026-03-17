# Storefront Payments API

Reference implementation:

- [packages/modules/src/payments/api/routes.ts](../../../packages/modules/src/payments/api/routes.ts)

Current payment provider flow is Flutterwave Uganda Mobile Money.

## Create Payment Intent

`POST /storefront/:tenantSlug/payments/intents`

Required header:

```http
Idempotency-Key: <stable-client-key>
```

Request:

```json
{
  "order_id": "8e352ac5-ff5a-4b22-b94b-d29620c13750",
  "customer_phone_e164": "+256712345678",
  "network": "MTN",
  "email": "shopper@example.com"
}
```

Response:

```json
{
  "intent": {
    "id": "f7f5a83c-1d51-42bc-9b4b-238be56ee968",
    "tenant_id": "<tenantId>",
    "order_id": "8e352ac5-ff5a-4b22-b94b-d29620c13750",
    "provider": "flutterwave",
    "method": "mobile_money",
    "status": "AWAITING_CUSTOMER",
    "amount": 3500,
    "currency": "UGX",
    "tx_ref": "t:<tenantId>:o:<orderId>:pi:<intentId>:ts:<unix>",
    "provider_reference": "t:<tenantId>:o:<orderId>:pi:<intentId>:ts:<unix>",
    "provider_transaction_id": null,
    "customer_phone_e164": "+256712345678",
    "customer_email": "shopper@example.com",
    "network": "MTN",
    "failure_code": null,
    "failure_message": null,
    "created_at": "2026-03-17T12:00:00.000Z",
    "updated_at": "2026-03-17T12:00:00.000Z",
    "next_action": {
      "type": "display_message",
      "message": "Mobile money prompt initiated"
    }
  }
}
```

## Provider Webhook

`POST /payments/webhooks/flutterwave`

This is a provider-facing endpoint, not a merchant route.

Behavior:

- validates Flutterwave `verif-hash`
- dedupes inbound provider events
- verifies successful transactions with Flutterwave before marking the order paid
- updates payment intent state and transitions the order through the ORD payment port

## Common Payment Error Codes

- `payment_order_not_found`
- `payment_order_not_payable`
- `payment_phone_invalid`
- `payment_provider_unavailable`
- `payment_idempotency_conflict`
- `payment_webhook_hash_missing`
- `payment_webhook_hash_mismatch`
- `payment_transaction_verification_failed`
- `payment_transaction_mismatch`

export enum ErrorCode {
  ValidationFailed = 'validation_failed',
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',
  NotFound = 'not_found',
  Conflict = 'conflict',
  RateLimited = 'rate_limited',
  IdempotencyConflict = 'idempotency_conflict',
  TenantResolutionFailed = 'tenant_resolution_failed',
  PublishValidationFailed = 'publish_validation_failed',
  PaymentProviderError = 'payment_provider_error',
  NotificationFailed = 'notification_failed',
  InternalError = 'internal_error'
}

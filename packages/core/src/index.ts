import { loadEnv } from './config/loadEnv';

export { loadEnv } from './config/loadEnv';
export type { AppConfig as AppConfigShape } from './config/loadEnv';
export { createLogger, withRequestContext } from './observability/logger';
export type { RequestContext } from './observability/requestContext';
export { createDbClient, runInTransaction, withTx } from './db';
export type { DatabaseSchema } from './db';
export { authMiddleware, tenantMiddleware } from './http';
export type { AuthContext, TenantContext, RouteAccess, RequestAuthState } from './http';
export { createOutboxWriter, createOutboxDispatcher } from './outbox';
export type { OutboxEvent, OutboxRecord } from './outbox';
export { createIdempotencyService } from './idempotency';
export type { IdempotencyBeginResult, IdempotencyRecord, IdempotencyState } from './idempotency';
export { createAuditWriter } from './audit';
export type { AuditEvent, AuditRecord } from './audit';

export const AppConfig = loadEnv();

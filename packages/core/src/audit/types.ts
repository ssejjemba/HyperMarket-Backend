export type AuditEvent = {
  id?: string;
  tenantId: string;
  actorUserId?: string | undefined;
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
  occurredAt?: Date;
};

export type AuditRecord = {
  id: string;
  tenantId: string;
  actorUserId?: string | undefined;
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
  occurredAt: Date;
  createdAt: Date;
};

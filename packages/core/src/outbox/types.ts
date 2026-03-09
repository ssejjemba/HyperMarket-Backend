export type OutboxEvent = {
  id?: string;
  eventType: string;
  tenantId?: string | undefined;
  correlationId?: string | undefined;
  actorUserId?: string | undefined;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  availableAt?: Date;
};

export type OutboxRecord = {
  id: string;
  eventType: string;
  tenantId?: string | undefined;
  correlationId?: string | undefined;
  actorUserId?: string | undefined;
  payload: Record<string, unknown>;
  occurredAt: Date;
  availableAt: Date;
  dispatchedAt?: Date | undefined;
  attempts: number;
  lastError?: string | undefined;
};

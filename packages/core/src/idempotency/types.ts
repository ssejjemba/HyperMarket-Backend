export type IdempotencyState = 'in_progress' | 'completed';

export type IdempotencyRecord = {
  id: string;
  tenantId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  responseRef?: string | undefined;
  state: IdempotencyState;
  createdAt: Date;
  updatedAt: Date;
};

export type IdempotencyBeginResult =
  | { status: 'created'; record: IdempotencyRecord }
  | { status: 'replay'; record: IdempotencyRecord };

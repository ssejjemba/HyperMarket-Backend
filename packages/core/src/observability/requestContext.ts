export type RequestContext = {
  requestId: string;
  traceId: string;
  userId?: string | undefined;
  tenantId?: string | undefined;
};

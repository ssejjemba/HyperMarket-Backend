export const toAuditRequestId = (requestId: string | undefined): string | undefined => {
  if (requestId === undefined || requestId.length === 0) {
    return undefined;
  }

  return requestId;
};

export type RevalidationRequest = {
  tenant_id: string;
  targets: string[];
};

export type RevalidationResponse = {
  accepted: true;
};

export const parseRevalidationRequest = (input: unknown): RevalidationRequest => {
  const value = input as Record<string, unknown>;
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof value.tenant_id !== 'string' ||
    !Array.isArray(value.targets) ||
    !value.targets.every((target: unknown) => typeof target === 'string')
  ) {
    throw new Error('Invalid storefront revalidation request');
  }

  return {
    tenant_id: value.tenant_id,
    targets: [...value.targets]
  };
};

export const parseRevalidationResponse = (input: unknown): RevalidationResponse => {
  const value = input as Record<string, unknown>;
  if (typeof input !== 'object' || input === null || value.accepted !== true) {
    throw new Error('Invalid storefront revalidation response');
  }

  return { accepted: true };
};

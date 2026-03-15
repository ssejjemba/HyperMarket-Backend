import type { BaseLogger } from 'pino';

import type { StorefrontRevalidationRequest } from './storefrontRevalidationTypes';

export class PermanentStorefrontRevalidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentStorefrontRevalidationError';
  }
}

type FetchFn = typeof fetch;

export type StorefrontRevalidationClient = {
  revalidate(input: StorefrontRevalidationRequest): Promise<void>;
};

export const createStorefrontRevalidationClient = (deps: {
  url: string;
  token: string;
  logger: Pick<BaseLogger, 'info' | 'error'>;
  fetchFn?: FetchFn;
}): StorefrontRevalidationClient => {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async revalidate(input) {
      deps.logger.info(
        {
          tenantId: input.tenant_id,
          targetCount: input.targets.length
        },
        'Dispatching storefront revalidation'
      );

      const response = await fetchFn(deps.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.token}`
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const message = `Storefront revalidation failed with status ${response.status}`;

        deps.logger.error(
          {
            tenantId: input.tenant_id,
            statusCode: response.status,
            targetCount: input.targets.length
          },
          'Storefront revalidation failed'
        );

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new PermanentStorefrontRevalidationError(message);
        }

        throw new Error(message);
      }

      deps.logger.info(
        {
          tenantId: input.tenant_id,
          targetCount: input.targets.length
        },
        'Storefront revalidation accepted'
      );
    }
  };
};

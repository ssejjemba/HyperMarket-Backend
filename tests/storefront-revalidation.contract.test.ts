import { describe, expect, it } from 'vitest';

import {
  parseRevalidationRequest,
  parseRevalidationResponse,
  type RevalidationRequest
} from '@hypermarket/contracts';

describe('storefront revalidation contract', () => {
  it('validates and serializes a request payload', () => {
    const payload: RevalidationRequest = {
      tenant_id: 'tenant-1',
      targets: ['/', '/sitemap.xml']
    };

    const json = JSON.stringify(payload);

    expect(parseRevalidationRequest(JSON.parse(json))).toEqual(payload);
  });

  it('validates and serializes a response payload', () => {
    const payload = { accepted: true } as const;

    const json = JSON.stringify(payload);

    expect(parseRevalidationResponse(JSON.parse(json))).toEqual(payload);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { OutboxRecord } from '@hypermarket/core';

import {
  STOREFRONT_REVALIDATION_DLQ,
  STOREFRONT_REVALIDATION_QUEUE,
  createStorefrontRevalidationClient,
  enqueueStorefrontRevalidationJob,
  handleStorefrontRevalidationFailure
} from '../apps/worker/src/revalidation';

describe('worker storefront revalidation queue', () => {
  it('enqueues publishing outbox events as revalidation jobs', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const event: OutboxRecord = {
      id: 'outbox-1',
      eventType: 'Publish.Completed',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorUserId: 'user-1',
      payload: {
        tenant_id: 'tenant-1',
        config_id: 'config-1',
        previous_config_id: null,
        targets: ['/', '/sitemap.xml']
      },
      occurredAt: new Date(),
      availableAt: new Date(),
      attempts: 0
    };

    const queued = await enqueueStorefrontRevalidationJob({ add }, event);

    expect(queued).toBe(true);
    expect(add).toHaveBeenCalledWith(
      STOREFRONT_REVALIDATION_QUEUE,
      {
        event_type: 'Publish.Completed',
        tenant_id: 'tenant-1',
        config_id: 'config-1',
        previous_config_id: null,
        targets: ['/', '/sitemap.xml']
      },
      expect.objectContaining({
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      })
    );
  });

  it('backfills deterministic targets for legacy publish events', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const event: OutboxRecord = {
      id: 'outbox-legacy',
      eventType: 'Publish.Completed',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorUserId: 'user-1',
      payload: {
        tenant_id: 'tenant-1',
        config_id: 'config-1',
        previous_config_id: null
      },
      occurredAt: new Date(),
      availableAt: new Date(),
      attempts: 0
    };

    await enqueueStorefrontRevalidationJob({ add }, event);

    expect(add).toHaveBeenCalledWith(
      STOREFRONT_REVALIDATION_QUEUE,
      expect.objectContaining({
        targets: ['/', '/sitemap.xml', '/robots.txt']
      }),
      expect.any(Object)
    );
  });

  it('moves permanently failed jobs to the DLQ and increments metrics', async () => {
    const dlqAdd = vi.fn().mockResolvedValue(undefined);
    const metrics = {
      storefrontRevalidationDlqTotal: vi.fn()
    };
    const logger = {
      error: vi.fn()
    };

    await handleStorefrontRevalidationFailure({
      dlq: { add: dlqAdd },
      metrics,
      logger,
      job: {
        id: 'job-1',
        name: STOREFRONT_REVALIDATION_QUEUE,
        data: {
          event_type: 'Rollback.Completed',
          tenant_id: 'tenant-1',
          config_id: 'config-2',
          previous_config_id: 'config-1',
          targets: ['/']
        },
        attemptsMade: 3,
        opts: { attempts: 3 }
      },
      error: new Error('upstream timeout')
    });

    expect(dlqAdd).toHaveBeenCalledWith(
      STOREFRONT_REVALIDATION_DLQ,
      expect.objectContaining({
        tenant_id: 'tenant-1',
        error_message: 'upstream timeout'
      })
    );
    expect(metrics.storefrontRevalidationDlqTotal).toHaveBeenCalledWith({
      reason: 'permanent_failure'
    });
  });
});

describe('worker storefront revalidation client', () => {
  it('forms the HTTP request correctly and never logs secrets', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 202
    });
    const client = createStorefrontRevalidationClient({
      url: 'https://storefront.example.com/api/revalidate',
      token: 'super-secret-token',
      logger: { info, error },
      fetchFn: fetchFn as typeof fetch
    });

    await client.revalidate({
      tenant_id: 'tenant-1',
      targets: ['/', '/sitemap.xml']
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://storefront.example.com/api/revalidate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer super-secret-token',
          'content-type': 'application/json'
        }),
        body: JSON.stringify({
          tenant_id: 'tenant-1',
          targets: ['/', '/sitemap.xml']
        })
      })
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('super-secret-token');
    expect(JSON.stringify(error.mock.calls)).not.toContain('super-secret-token');
  });

  it('enqueues catalog outbox events as revalidation jobs', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const event: OutboxRecord = {
      id: 'outbox-cat-1',
      eventType: 'Catalog.ProductUpserted',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorUserId: 'user-1',
      payload: {
        tenant_id: 'tenant-1',
        product_id: 'product-1',
        slug: 'fresh-milk',
        targets: ['/', '/products', '/products/fresh-milk']
      },
      occurredAt: new Date(),
      availableAt: new Date(),
      attempts: 0
    };

    const queued = await enqueueStorefrontRevalidationJob({ add }, event);

    expect(queued).toBe(true);
    expect(add).toHaveBeenCalledWith(
      STOREFRONT_REVALIDATION_QUEUE,
      {
        event_type: 'Catalog.ProductUpserted',
        tenant_id: 'tenant-1',
        config_id: undefined,
        previous_config_id: undefined,
        targets: ['/', '/products', '/products/fresh-milk']
      },
      expect.any(Object)
    );
  });
});

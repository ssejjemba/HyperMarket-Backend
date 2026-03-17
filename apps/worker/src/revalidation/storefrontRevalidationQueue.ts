import type { JobsOptions, Queue, Job } from 'bullmq';

import type { OutboxRecord } from '@hypermarket/core';

import type { StorefrontRevalidationMetrics } from './storefrontRevalidationMetrics';
import type { StorefrontRevalidationJobPayload } from './storefrontRevalidationTypes';

export const STOREFRONT_REVALIDATION_QUEUE = 'storefront.revalidate';
export const STOREFRONT_REVALIDATION_DLQ = 'storefront.revalidate.dlq';
const DEFAULT_REVALIDATION_TARGETS = ['/', '/sitemap.xml', '/robots.txt'] as const;
const SUPPORTED_EVENT_TYPES = new Set([
  'Publish.Completed',
  'Rollback.Completed',
  'Catalog.ProductUpserted',
  'Catalog.ProductDeleted',
  'Catalog.CategoryUpserted',
  'Catalog.CategoryDeleted',
  'Catalog.ProductCategoryChanged',
  'Fulfillment.SettingsUpdated',
  'Fulfillment.ZoneUpserted',
  'Fulfillment.ZoneDeactivated'
]);

const REVALIDATION_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000
  },
  removeOnComplete: 1000
};

const toRevalidationPayload = (
  eventType: string,
  payload: Record<string, unknown>
): StorefrontRevalidationJobPayload | null => {
  if (typeof payload.tenant_id !== 'string') {
    return null;
  }

  const targets = Array.isArray(payload.targets)
    ? payload.targets.filter((target): target is string => typeof target === 'string')
    : [...DEFAULT_REVALIDATION_TARGETS];

  return {
    event_type: eventType,
    tenant_id: payload.tenant_id,
    config_id: typeof payload.config_id === 'string' ? payload.config_id : undefined,
    previous_config_id:
      typeof payload.previous_config_id === 'string' || payload.previous_config_id === null
        ? (payload.previous_config_id as string | null | undefined)
        : undefined,
    targets
  } as StorefrontRevalidationJobPayload;
};

export const enqueueStorefrontRevalidationJob = async (
  queue: Pick<Queue<StorefrontRevalidationJobPayload>, 'add'>,
  event: OutboxRecord
): Promise<boolean> => {
  if (!SUPPORTED_EVENT_TYPES.has(event.eventType)) {
    return false;
  }

  const payload = toRevalidationPayload(event.eventType, event.payload);
  if (payload === null) {
    throw new Error(`Outbox event ${event.id} has invalid revalidation payload`);
  }

  await queue.add(
    STOREFRONT_REVALIDATION_QUEUE,
    {
      ...payload
    },
    REVALIDATION_JOB_OPTIONS
  );

  return true;
};

export const handleStorefrontRevalidationFailure = async (deps: {
  dlq: Pick<Queue, 'add'>;
  metrics: StorefrontRevalidationMetrics;
  logger: { error(bindings: Record<string, unknown>, message: string): void };
  job: Pick<
    Job<StorefrontRevalidationJobPayload>,
    'id' | 'name' | 'data' | 'attemptsMade' | 'opts'
  >;
  error: unknown;
}): Promise<void> => {
  const attempts = deps.job.opts.attempts ?? 1;
  if (deps.job.attemptsMade < attempts) {
    return;
  }

  const message = deps.error instanceof Error ? deps.error.message : 'unknown_error';

  await deps.dlq.add(STOREFRONT_REVALIDATION_DLQ, {
    ...deps.job.data,
    error_message: message
  });

  deps.metrics.storefrontRevalidationDlqTotal({ reason: 'permanent_failure' });
  deps.logger.error(
    {
      jobId: deps.job.id,
      queueName: deps.job.name,
      tenantId: deps.job.data.tenant_id,
      attemptsMade: deps.job.attemptsMade,
      errorMessage: message
    },
    'Storefront revalidation moved to DLQ'
  );
};

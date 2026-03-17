import { describe, expect, it, vi } from 'vitest';

import {
  listDlqJobs,
  replayDlqJob,
  resolveQueueTarget,
  summarizeQueueCounts
} from '../apps/worker/src/ops/runtimeOps';

describe('runtime ops helpers', () => {
  it('resolves supported queue targets', () => {
    expect(resolveQueueTarget('notifications')).toMatchObject({
      label: 'notifications',
      primary: 'notifications.dispatch',
      dlq: 'notifications.dispatch.dlq'
    });
    expect(resolveQueueTarget('revalidation')).toMatchObject({
      label: 'revalidation',
      primary: 'storefront.revalidate',
      dlq: 'storefront.revalidate.dlq'
    });
  });

  it('lists dlq jobs with the relevant fields', async () => {
    const jobs = await listDlqJobs(
      {
        getJobs: vi.fn().mockResolvedValue([
          {
            id: 'job-1',
            name: 'notifications.dispatch.dlq',
            attemptsMade: 8,
            timestamp: 100,
            data: { job_id: 'abc' }
          }
        ])
      },
      10
    );

    expect(jobs).toEqual([
      {
        id: 'job-1',
        name: 'notifications.dispatch.dlq',
        attemptsMade: 8,
        timestamp: 100,
        data: { job_id: 'abc' }
      }
    ]);
  });

  it('replays dlq jobs back to the primary queue without the error marker', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue(undefined);

    const result = await replayDlqJob(
      {
        primary: {
          add
        },
        dlq: {
          getJob: vi.fn().mockResolvedValue({
            data: {
              tenant_id: 'tenant-1',
              error_message: 'previous failure'
            },
            remove
          })
        }
      },
      {
        target: resolveQueueTarget('notifications'),
        jobId: '99'
      }
    );

    expect(result).toEqual({ replayed: true });
    expect(add).toHaveBeenCalledWith('notifications.dispatch', {
      tenant_id: 'tenant-1'
    });
    expect(remove).toHaveBeenCalled();
  });

  it('summarizes primary and dlq queue counts', async () => {
    const counts = await summarizeQueueCounts(
      {
        getJobCounts: vi.fn().mockResolvedValue({
          waiting: 1,
          active: 2
        })
      },
      {
        getJobCounts: vi.fn().mockResolvedValue({
          waiting: 3,
          failed: 1
        })
      }
    );

    expect(counts).toEqual({
      primary: {
        waiting: 1,
        active: 2
      },
      dlq: {
        waiting: 3,
        failed: 1
      }
    });
  });
});

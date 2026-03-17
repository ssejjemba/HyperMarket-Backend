import { loadEnv } from '@hypermarket/core';

import {
  closeQueues,
  createQueueClients,
  listDlqJobs,
  replayDlqJob,
  resolveQueueTarget
} from './runtimeOps';
import { loadWorkerEnv } from './loadWorkerEnv';

const usage = (): never => {
  throw new Error(
    [
      'Usage:',
      '  corepack pnpm exec tsx apps/worker/src/ops/dlq.ts list <notifications|revalidation> [limit]',
      '  corepack pnpm exec tsx apps/worker/src/ops/dlq.ts replay <notifications|revalidation> <jobId>'
    ].join('\n')
  );
};

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit "${value}"`);
  }

  return parsed;
};

const main = async (): Promise<void> => {
  const [command, targetArg, arg] = process.argv.slice(2);
  if (command === undefined || targetArg === undefined) {
    usage();
  }

  loadWorkerEnv();
  const config = loadEnv();
  const target = resolveQueueTarget(targetArg as string);
  const queues = createQueueClients(config.redisUrl, target);

  try {
    if (command === 'list') {
      const jobs = await listDlqJobs(queues.dlq, parseLimit(arg));
      console.log(
        JSON.stringify(
          {
            queue: target.label,
            dlq: target.dlq,
            jobs
          },
          null,
          2
        )
      );
      return;
    }

    if (command === 'replay') {
      const jobId = arg ?? usage();

      const result = await replayDlqJob(
        {
          primary: queues.primary,
          dlq: queues.dlq
        },
        {
          target,
          jobId
        }
      );

      console.log(
        JSON.stringify(
          {
            queue: target.label,
            dlq: target.dlq,
            job_id: jobId,
            ...result
          },
          null,
          2
        )
      );
      return;
    }

    usage();
  } finally {
    await closeQueues(queues);
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

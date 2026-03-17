import { afterEach, describe, expect, it } from 'vitest';

import { createMetricsRegistry } from '@hypermarket/core';

import { createMetricsHttpServer } from '../apps/worker/src/metricsServer';

describe('worker metrics server', () => {
  const servers: Array<ReturnType<typeof createMetricsHttpServer>> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it('serves metrics and live health', async () => {
    const registry = createMetricsRegistry();
    const counter = registry.createCounter<{ outcome: string }>(
      'worker_demo_total',
      'Worker demo',
      ['outcome']
    );
    counter.inc({ outcome: 'success' });

    const server = createMetricsHttpServer({
      host: '127.0.0.1',
      port: 9564,
      registry,
      logger: {
        info() {},
        error() {}
      }
    });
    servers.push(server);
    await server.start();

    const metricsResponse = await fetch('http://127.0.0.1:9564/metrics');
    const healthResponse = await fetch('http://127.0.0.1:9564/health/live');

    expect(metricsResponse.status).toBe(200);
    expect(await metricsResponse.text()).toContain('worker_demo_total{outcome="success"} 1');
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: 'ok' });
  });
});

import { describe, expect, it } from 'vitest';

import { createMetricsRegistry } from '@hypermarket/core';

describe('metrics registry', () => {
  it('renders counters, gauges, and collectors in prometheus text format', async () => {
    const registry = createMetricsRegistry();
    const counter = registry.createCounter<{ outcome: string }>(
      'demo_counter_total',
      'Demo counter',
      ['outcome']
    );
    const gauge = registry.createGauge<{ queue: string }>('demo_queue_jobs', 'Demo gauge', [
      'queue'
    ]);

    counter.inc({ outcome: 'success' });
    counter.inc({ outcome: 'success' }, 2);
    gauge.set({ queue: 'notifications' }, 4);
    registry.registerCollector(
      () => '# HELP custom_metric Custom metric\n# TYPE custom_metric gauge\ncustom_metric 9'
    );

    const rendered = await registry.render();

    expect(rendered).toContain('# HELP demo_counter_total Demo counter');
    expect(rendered).toContain('# TYPE demo_counter_total counter');
    expect(rendered).toContain('demo_counter_total{outcome="success"} 3');
    expect(rendered).toContain('demo_queue_jobs{queue="notifications"} 4');
    expect(rendered).toContain('custom_metric 9');
  });
});

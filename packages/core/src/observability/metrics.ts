type LabelValues = Record<string, string>;

type CounterMetric = {
  type: 'counter';
  help: string;
  labelNames: string[];
  samples: Map<string, { labels: LabelValues; value: number }>;
};

type GaugeMetric = {
  type: 'gauge';
  help: string;
  labelNames: string[];
  samples: Map<string, { labels: LabelValues; value: number }>;
};

type RegisteredMetric = CounterMetric | GaugeMetric;

type Collector = () => Promise<string> | string;

const escapeHelp = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

const escapeLabelValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

const labelKey = (labelNames: string[], labels: LabelValues): string =>
  labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join('\u0000');

const formatLabels = (labels: LabelValues, labelNames: string[]): string => {
  if (labelNames.length === 0) {
    return '';
  }

  return `{${labelNames
    .map((name) => `${name}="${escapeLabelValue(labels[name] ?? '')}"`)
    .join(',')}}`;
};

const assertMetricName = (name: string): void => {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
    throw new Error(`Invalid metric name "${name}"`);
  }
};

const assertLabelNames = (labelNames: string[]): void => {
  const seen = new Set<string>();
  for (const name of labelNames) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid metric label name "${name}"`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate metric label name "${name}"`);
    }
    seen.add(name);
  }
};

const assertLabels = (expected: string[], labels: LabelValues): void => {
  for (const name of expected) {
    if (labels[name] === undefined) {
      throw new Error(`Missing metric label "${name}"`);
    }
  }
};

const upsertSample = (
  metric: RegisteredMetric,
  labels: LabelValues
): { labels: LabelValues; value: number } => {
  assertLabels(metric.labelNames, labels);
  const normalized: LabelValues = Object.fromEntries(
    metric.labelNames.map((name) => [name, String(labels[name])])
  );
  const key = labelKey(metric.labelNames, normalized);
  const existing = metric.samples.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const sample = {
    labels: normalized,
    value: 0
  };
  metric.samples.set(key, sample);
  return sample;
};

export type CounterHandle<TLabels extends LabelValues> = {
  inc(labels: TLabels, value?: number): void;
};

export type GaugeHandle<TLabels extends LabelValues> = {
  set(labels: TLabels, value: number): void;
  inc(labels: TLabels, value?: number): void;
  dec(labels: TLabels, value?: number): void;
};

export type MetricsRegistry = {
  createCounter<TLabels extends LabelValues>(
    name: string,
    help: string,
    labelNames?: Array<keyof TLabels & string>
  ): CounterHandle<TLabels>;
  createGauge<TLabels extends LabelValues>(
    name: string,
    help: string,
    labelNames?: Array<keyof TLabels & string>
  ): GaugeHandle<TLabels>;
  registerCollector(collector: Collector): void;
  render(): Promise<string>;
};

export const createMetricsRegistry = (): MetricsRegistry => {
  const metrics = new Map<string, RegisteredMetric>();
  const collectors: Collector[] = [];

  const getOrCreateMetric = (
    type: RegisteredMetric['type'],
    name: string,
    help: string,
    labelNames: string[]
  ): RegisteredMetric => {
    assertMetricName(name);
    assertLabelNames(labelNames);

    const existing = metrics.get(name);
    if (existing !== undefined) {
      return existing;
    }

    const metric: RegisteredMetric = {
      type,
      help,
      labelNames,
      samples: new Map()
    };
    metrics.set(name, metric);
    return metric;
  };

  return {
    createCounter(name, help, labelNames = []) {
      const metric = getOrCreateMetric('counter', name, help, labelNames);

      return {
        inc(labels, value = 1) {
          const sample = upsertSample(metric, labels);
          sample.value += value;
        }
      };
    },

    createGauge(name, help, labelNames = []) {
      const metric = getOrCreateMetric('gauge', name, help, labelNames);

      return {
        set(labels, value) {
          const sample = upsertSample(metric, labels);
          sample.value = value;
        },
        inc(labels, value = 1) {
          const sample = upsertSample(metric, labels);
          sample.value += value;
        },
        dec(labels, value = 1) {
          const sample = upsertSample(metric, labels);
          sample.value -= value;
        }
      };
    },

    registerCollector(collector) {
      collectors.push(collector);
    },

    async render() {
      const lines: string[] = [];

      for (const [name, metric] of metrics.entries()) {
        lines.push(`# HELP ${name} ${escapeHelp(metric.help)}`);
        lines.push(`# TYPE ${name} ${metric.type}`);

        const samples = [...metric.samples.values()];
        if (samples.length === 0) {
          lines.push(`${name} 0`);
          continue;
        }

        for (const sample of samples) {
          lines.push(`${name}${formatLabels(sample.labels, metric.labelNames)} ${sample.value}`);
        }
      }

      for (const collector of collectors) {
        const rendered = await collector();
        if (rendered.trim().length > 0) {
          lines.push(rendered.trimEnd());
        }
      }

      return `${lines.join('\n')}\n`;
    }
  };
};

export type { LabelValues };

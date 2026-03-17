import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import type { MetricsRegistry } from '@hypermarket/core';

export const createMetricsHttpServer = (deps: {
  host: string;
  port: number;
  registry: MetricsRegistry;
  logger: {
    info(bindings: Record<string, unknown>, message: string): void;
    error(bindings: Record<string, unknown>, message: string): void;
  };
}) => {
  let started = false;

  const server = http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (request.url === '/health/live') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (request.url !== '/metrics') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not_found' }));
        return;
      }

      const body = await deps.registry.render();
      response.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8'
      });
      response.end(body);
    } catch (error) {
      deps.logger.error(
        {
          err: error
        },
        'Worker metrics request failed'
      );
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('worker_metrics_request_failed\n');
    }
  });

  return {
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(deps.port, deps.host, () => {
          server.off('error', reject);
          started = true;
          resolve();
        });
      });

      deps.logger.info(
        {
          host: deps.host,
          port: deps.port
        },
        'Worker metrics server started'
      );
    },
    async close() {
      if (!started) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }
          started = false;
          resolve();
        });
      });
    }
  };
};

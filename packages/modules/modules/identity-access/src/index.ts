import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../../../src/types';

export const registerRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {
  // Identity & Access routes will be registered here.
};

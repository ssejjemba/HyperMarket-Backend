import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerFulfillmentRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

export { FulfillmentError } from './errors/FulfillmentError';
export type { FulfillmentErrorCode } from './errors/FulfillmentError';

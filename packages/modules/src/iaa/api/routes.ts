import type { FastifyInstance } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { ModuleDeps } from '../../types';
import { requestOtpSchema } from './schemas/requestOtp';
import { verifyOtpSchema } from './schemas/verifyOtp';

export const registerIaaApiRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  deps.logger.info({ module: 'iaa' }, 'registering IAA routes');

  server.post('/auth/otp/request', async (request) => {
    request.log.info({ endpoint: 'iaa.otp.request' }, 'iaa: otp request received');

    const result = requestOtpSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: result.error.errors[0]?.message ?? 'Invalid request body'
      });
    }

    throw new AppError({ code: ErrorCode.NotImplemented, message: 'Not implemented' });
  });

  server.post('/auth/otp/verify', async (request) => {
    request.log.info({ endpoint: 'iaa.otp.verify' }, 'iaa: otp verify received');

    const result = verifyOtpSchema.safeParse(request.body);
    if (!result.success) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: result.error.errors[0]?.message ?? 'Invalid request body'
      });
    }

    throw new AppError({ code: ErrorCode.NotImplemented, message: 'Not implemented' });
  });

  server.get('/auth/session', async (request) => {
    request.log.info({ endpoint: 'iaa.session.get' }, 'iaa: session get received');

    throw new AppError({ code: ErrorCode.NotImplemented, message: 'Not implemented' });
  });
};

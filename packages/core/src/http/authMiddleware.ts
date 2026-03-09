import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { RequestLike, RouteAccess } from './types';

const requiresAuth = (access: RouteAccess): boolean => access !== 'public';

export const authMiddleware = (access: RouteAccess = 'public') => {
  return async (request: RequestLike): Promise<void> => {
    request.auth = {};

    const userId = request.auth?.userId;
    if (requiresAuth(access) && userId === undefined) {
      throw new AppError({
        code: ErrorCode.Unauthorized,
        message: 'Authentication required'
      });
    }
  };
};

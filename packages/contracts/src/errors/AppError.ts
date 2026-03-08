import type { ErrorCode } from './errorCodes';

type AppErrorParams = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = 'AppError';
    this.code = params.code;
    this.details = params.details;

    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
  }
}

import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type TemplateErrorCode = ErrorCode.TemplateNotFound | ErrorCode.TemplateVersionNotFound;

type TemplateErrorParams = {
  code: TemplateErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class TemplateError extends AppError {
  declare readonly code: TemplateErrorCode;

  constructor(params: TemplateErrorParams) {
    super(params);
    this.name = 'TemplateError';
  }

  static is(error: unknown): error is TemplateError {
    return error instanceof TemplateError;
  }
}

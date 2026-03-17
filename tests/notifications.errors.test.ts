import { describe, expect, it } from 'vitest';

import { ErrorCode, errorToHttp } from '@hypermarket/contracts';
import { NotificationError } from '@hypermarket/modules/notifications';

describe('NOT error mapping', () => {
  it.each([
    [ErrorCode.NotTemplateNotFound, 404],
    [ErrorCode.NotTemplatePayloadInvalid, 400],
    [ErrorCode.NotRecipientInvalid, 400],
    [ErrorCode.NotProviderUnavailable, 502],
    [ErrorCode.NotProviderAuthFailed, 502],
    [ErrorCode.NotProviderRateLimited, 429],
    [ErrorCode.NotSendFailedRetryable, 502],
    [ErrorCode.NotSendFailedNonRetryable, 409],
    [ErrorCode.NotJobNotFound, 404],
    [ErrorCode.NotJobDedupeConflict, 409],
    [ErrorCode.NotDbFailure, 500]
  ])('maps %s to %i', (code, expectedStatus) => {
    const error = new NotificationError({
      code,
      message: 'Notification failed'
    });

    expect(errorToHttp(error, 'req-not')).toMatchObject({
      status: expectedStatus,
      body: {
        request_id: 'req-not',
        error_code: code
      }
    });
  });
});

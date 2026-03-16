import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  buildMediaPublicUrl,
  buildMediaStorageKey,
  createDefaultMediaUploadPolicy,
  createSignedUploadUrlSigner,
  MediaError,
  sanitizeOriginalFilename
} from '@hypermarket/modules/media';

describe('MED domain helpers', () => {
  it('rejects unsupported mime types', () => {
    const policy = createDefaultMediaUploadPolicy(5 * 1024 * 1024);

    expect(() => policy.assertMimeAllowed('application/pdf')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.MediaMimeNotAllowed
      })
    );
  });

  it('rejects files larger than the configured limit', () => {
    const policy = createDefaultMediaUploadPolicy(100);

    expect(() => policy.assertByteSizeAllowed(101)).toThrowError(
      expect.objectContaining({
        code: ErrorCode.MediaFileTooLarge
      })
    );
  });

  it('sanitizes filenames and generates deterministic storage keys', () => {
    expect(sanitizeOriginalFilename(' Fresh Milk (1L).PNG ')).toBe('fresh-milk-1l-.png');
    expect(
      buildMediaStorageKey({
        tenantId: 'tenant-1',
        assetId: 'asset-1',
        originalFilename: ' Fresh Milk (1L).PNG '
      })
    ).toBe('tenants/tenant-1/assets/asset-1/fresh-milk-1l-.png');
  });

  it('builds public CDN urls without duplicate slashes', () => {
    expect(buildMediaPublicUrl('https://cdn.platform.ug/', '/tenants/t1/assets/a1')).toBe(
      'https://cdn.platform.ug/tenants/t1/assets/a1'
    );
  });

  it('creates signed upload urls with content-type headers', () => {
    const signer = createSignedUploadUrlSigner({
      baseUrl: 'https://uploads.platform.ug/direct',
      secret: 'test-secret',
      ttlSeconds: 900
    });

    const signed = signer.sign({
      assetId: 'asset-1',
      storageKey: 'tenants/t1/assets/asset-1/image.png',
      mimeType: 'image/png',
      byteSize: 1024
    });

    expect(signed.uploadUrl).toContain('https://uploads.platform.ug/direct?');
    expect(signed.uploadHeaders).toEqual({
      'content-type': 'image/png'
    });
  });

  it('exposes MediaError as the fail-loud error type', () => {
    expect(new MediaError({ code: ErrorCode.MediaValidationFailed, message: 'invalid' }).name).toBe(
      'MediaError'
    );
  });
});

import crypto from 'node:crypto';

export type UploadUrlDescriptor = {
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: Date;
};

export interface UploadUrlSigner {
  sign(input: {
    assetId: string;
    storageKey: string;
    mimeType: string;
    byteSize: number;
  }): UploadUrlDescriptor;
}

export const createSignedUploadUrlSigner = (config: {
  baseUrl: string;
  secret: string;
  ttlSeconds: number;
}): UploadUrlSigner => {
  return {
    sign(input) {
      const expiresAt = new Date(Date.now() + config.ttlSeconds * 1000);
      const payload = [
        input.assetId,
        input.storageKey,
        input.mimeType,
        String(input.byteSize),
        expiresAt.toISOString()
      ].join(':');
      const signature = crypto.createHmac('sha256', config.secret).update(payload).digest('hex');
      const url = new URL(config.baseUrl);

      url.searchParams.set('asset_id', input.assetId);
      url.searchParams.set('storage_key', input.storageKey);
      url.searchParams.set('mime_type', input.mimeType);
      url.searchParams.set('byte_size', String(input.byteSize));
      url.searchParams.set('expires_at', expiresAt.toISOString());
      url.searchParams.set('signature', signature);

      return {
        uploadUrl: url.toString(),
        uploadHeaders: {
          'content-type': input.mimeType
        },
        expiresAt
      };
    }
  };
};

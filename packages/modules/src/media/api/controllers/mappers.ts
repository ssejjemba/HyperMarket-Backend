import type { MediaAssetRecord } from '../../persistence/MediaAssetRepoPg';

export const mapMediaAssetDto = (asset: MediaAssetRecord & { publicUrl: string }) => ({
  id: asset.id,
  tenant_id: asset.tenantId,
  storage_key: asset.storageKey,
  mime_type: asset.mimeType,
  byte_size: asset.byteSize,
  width: asset.width,
  height: asset.height,
  checksum: asset.checksum,
  status: asset.status,
  created_by_user_id: asset.createdByUserId,
  created_at: asset.createdAt.toISOString(),
  deleted_at: asset.deletedAt?.toISOString() ?? null,
  public_url: asset.publicUrl
});

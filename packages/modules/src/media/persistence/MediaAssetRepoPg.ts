import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

export type MediaAssetStatus = 'uploaded' | 'confirmed' | 'deleted';

export type MediaAssetRecord = {
  id: string;
  tenantId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  status: MediaAssetStatus;
  createdByUserId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

type ListAssetsInput = {
  tenantId: string;
  cursor?: string | undefined;
  limit: number;
};

type CreatePendingAssetInput = {
  tenantId: string;
  assetId?: string | undefined;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  createdByUserId: string | null;
};

const mapRow = (row: DatabaseSchema['media_assets']): MediaAssetRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  storageKey: row.storage_key,
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size),
  width: row.width,
  height: row.height,
  checksum: row.checksum,
  status: row.status,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  deletedAt: row.deleted_at
});

const encodeCursor = (asset: MediaAssetRecord): string => {
  return Buffer.from(`${asset.createdAt.toISOString()}::${asset.id}`).toString('base64url');
};

const decodeCursor = (cursor: string): { createdAt: Date; id: string } | null => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separatorIndex = decoded.indexOf('::');
    if (separatorIndex === -1) {
      return null;
    }

    const createdAt = new Date(decoded.slice(0, separatorIndex));
    const id = decoded.slice(separatorIndex + 2);
    if (Number.isNaN(createdAt.getTime()) || id.length === 0) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
};

export const createMediaAssetRepoPg = (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>
) => {
  return {
    async createPendingAsset(input: CreatePendingAssetInput): Promise<MediaAssetRecord> {
      const row = await db
        .insertInto('media_assets')
        .values({
          id: input.assetId ?? (sql`gen_random_uuid()` as unknown as string),
          tenant_id: input.tenantId,
          storage_key: input.storageKey,
          mime_type: input.mimeType,
          byte_size: input.byteSize,
          width: null,
          height: null,
          checksum: null,
          status: 'uploaded',
          created_by_user_id: input.createdByUserId,
          created_at: sql`now()`,
          deleted_at: null
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapRow(row);
    },

    async getAssetById(tenantId: string, assetId: string): Promise<MediaAssetRecord | null> {
      const row = await db
        .selectFrom('media_assets')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', assetId)
        .executeTakeFirst();

      return row === undefined ? null : mapRow(row);
    },

    async confirmAsset(input: {
      tenantId: string;
      assetId: string;
      storageKey: string;
      mimeType: string;
      byteSize: number;
      checksum?: string | null | undefined;
    }): Promise<MediaAssetRecord | null> {
      const row = await db
        .updateTable('media_assets')
        .set({
          storage_key: input.storageKey,
          mime_type: input.mimeType,
          byte_size: input.byteSize,
          checksum: input.checksum ?? null,
          status: 'confirmed'
        })
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.assetId)
        .where('status', '=', 'uploaded')
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      return row === undefined ? null : mapRow(row);
    },

    async softDeleteAsset(tenantId: string, assetId: string): Promise<MediaAssetRecord | null> {
      const row = await db
        .updateTable('media_assets')
        .set({
          status: 'deleted',
          deleted_at: new Date()
        })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', assetId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();

      return row === undefined ? null : mapRow(row);
    },

    async listAssets(input: ListAssetsInput): Promise<{
      items: MediaAssetRecord[];
      nextCursor?: string | undefined;
    }> {
      let query = db
        .selectFrom('media_assets')
        .selectAll()
        .where('tenant_id', '=', input.tenantId)
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc');

      const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor);
      if (cursor !== null) {
        query = query.where((eb) =>
          eb.or([
            eb('created_at', '<', cursor.createdAt),
            eb.and([eb('created_at', '=', cursor.createdAt), eb('id', '<', cursor.id)])
          ])
        );
      }

      const rows = await query.limit(input.limit + 1).execute();
      const items = rows.slice(0, input.limit).map(mapRow);
      const hasMore = rows.length > input.limit;
      const lastItem = items.at(-1);

      return {
        items,
        ...(hasMore && lastItem !== undefined ? { nextCursor: encodeCursor(lastItem) } : {})
      };
    }
  };
};

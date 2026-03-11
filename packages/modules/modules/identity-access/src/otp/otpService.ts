import crypto from 'node:crypto';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { sql, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

type OtpRecord = {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  status: string;
};

type OtpServiceConfig = {
  otpSecret: string;
  ttlSeconds: number;
  isDev: boolean;
};

const hashCode = (code: string, secret: string): string => {
  return crypto
    .createHash('sha256')
    .update(code + secret)
    .digest('hex');
};

const generateCode = (): string => {
  const value = crypto.randomInt(100000, 1000000);
  return String(value);
};

export type OtpService = {
  requestOtp: (
    trx: Transaction<DatabaseSchema>,
    phone: string
  ) => Promise<{ otpId: string; code?: string }>; // code only in dev
  verifyOtp: (trx: Transaction<DatabaseSchema>, phone: string, code: string) => Promise<OtpRecord>;
};

export const createOtpService = (config: OtpServiceConfig): OtpService => {
  return {
    requestOtp: async (trx, phone) => {
      const code = generateCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + config.ttlSeconds * 1000);

      const row = await trx
        .insertInto('auth_otps')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          phone_e164: phone,
          code_hash: hashCode(code, config.otpSecret),
          expires_at: expiresAt,
          attempt_count: 0,
          max_attempts: 5,
          status: 'ACTIVE',
          last_sent_at: now,
          created_at: now
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      if (config.isDev) {
        return { otpId: row.id, code };
      }

      return { otpId: row.id };
    },
    verifyOtp: async (trx, phone, code) => {
      const now = new Date();
      const row = await trx
        .selectFrom('auth_otps')
        .select(['id', 'phone_e164', 'code_hash', 'expires_at', 'status'])
        .where('phone_e164', '=', phone)
        .where('expires_at', '>', now)
        .where('status', '=', 'ACTIVE')
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      if (row === undefined) {
        throw new AppError({
          code: ErrorCode.ValidationFailed,
          message: 'OTP not found or expired'
        });
      }

      const expected = hashCode(code, config.otpSecret);
      if (row.code_hash !== expected) {
        throw new AppError({
          code: ErrorCode.ValidationFailed,
          message: 'Invalid OTP'
        });
      }

      await trx
        .updateTable('auth_otps')
        .set({ status: 'CONSUMED' })
        .where('id', '=', row.id)
        .execute();

      return {
        id: row.id,
        phone: row.phone_e164,
        codeHash: row.code_hash,
        expiresAt: row.expires_at,
        status: 'CONSUMED'
      };
    }
  };
};

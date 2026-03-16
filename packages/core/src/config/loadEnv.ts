import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, { message: 'Required' }).url({ message: 'Must be a valid URL' }),
  REDIS_URL: z.string().min(1, { message: 'Required' }).url({ message: 'Must be a valid URL' }),
  JWT_SECRET: z.string().min(1, { message: 'Required' }),
  JWT_ISSUER: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1, { message: 'Required' }),
  TWILIO_AUTH_TOKEN: z.string().min(1, { message: 'Required' }),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1, { message: 'Required' }),
  PLATFORM_ROOT_DOMAIN: z.string().min(1, { message: 'Required' }),
  MEDIA_CDN_BASE_URL: z
    .string()
    .min(1)
    .url({ message: 'Must be a valid URL' })
    .optional()
    .default('http://localhost:3002/cdn'),
  MEDIA_UPLOAD_BASE_URL: z
    .string()
    .min(1)
    .url({ message: 'Must be a valid URL' })
    .optional()
    .default('http://localhost:3002/uploads'),
  MEDIA_UPLOAD_URL_TTL_SECONDS: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? 900 : Number(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'MEDIA_UPLOAD_URL_TTL_SECONDS must be a positive number'
    }),
  MEDIA_MAX_FILE_BYTES: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? 5 * 1024 * 1024 : Number(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'MEDIA_MAX_FILE_BYTES must be a positive number'
    }),
  PAYMENT_DEFAULT_PROVIDER: z.string().min(1).optional().default('flutterwave'),
  PAYMENT_RECONCILIATION_STALE_MINUTES: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? 10 : Number(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'PAYMENT_RECONCILIATION_STALE_MINUTES must be a positive number'
    }),
  FLW_SECRET_KEY: z.string().min(1).optional(),
  FLW_WEBHOOK_SECRET_HASH: z.string().min(1).optional(),
  FLW_BASE_URL: z
    .string()
    .min(1)
    .url({ message: 'Must be a valid URL' })
    .optional()
    .default('https://api.flutterwave.com'),
  FLW_DEFAULT_NETWORK: z.enum(['MTN', 'AIRTEL']).optional().default('MTN'),
  OTP_SECRET: z.string().min(1).optional(),
  OTP_TTL_SECONDS: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? 300 : Number(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'OTP_TTL_SECONDS must be a positive number'
    }),
  SESSION_TTL_SECONDS: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? 60 * 60 * 24 * 7 : Number(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'SESSION_TTL_SECONDS must be a positive number'
    }),
  ENABLE_DEV_ROUTES: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  PORT: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return 3000;
      }

      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        return NaN;
      }

      return parsed;
    })
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'Must be a valid port number'
    })
});

type EnvSchema = z.infer<typeof envSchema>;

const formatEnvErrors = (errors: z.ZodError<EnvSchema>): string => {
  const lines = errors.issues.map((issue) => {
    const path = issue.path.join('.') || 'value';
    return `- ${path}: ${issue.message}`;
  });

  return `Invalid environment configuration:\n${lines.join('\n')}`;
};

export type AppConfig = {
  nodeEnv: EnvSchema['NODE_ENV'];
  databaseUrl: EnvSchema['DATABASE_URL'];
  redisUrl: EnvSchema['REDIS_URL'];
  port: number;
  logLevel: NonNullable<EnvSchema['LOG_LEVEL']>;
  jwtSecret: EnvSchema['JWT_SECRET'];
  jwtIssuer?: EnvSchema['JWT_ISSUER'];
  twilioAccountSid: EnvSchema['TWILIO_ACCOUNT_SID'];
  twilioAuthToken: EnvSchema['TWILIO_AUTH_TOKEN'];
  twilioVerifyServiceSid: EnvSchema['TWILIO_VERIFY_SERVICE_SID'];
  platformRootDomain: EnvSchema['PLATFORM_ROOT_DOMAIN'];
  mediaCdnBaseUrl: string;
  mediaUploadBaseUrl: string;
  mediaUploadUrlTtlSeconds: number;
  mediaMaxFileBytes: number;
  paymentDefaultProvider: string;
  paymentReconciliationStaleMinutes: number;
  flwSecretKey: string | undefined;
  flwWebhookSecretHash: string | undefined;
  flwBaseUrl: string;
  flwDefaultNetwork: 'MTN' | 'AIRTEL';
  otpSecret: string;
  otpTtlSeconds: number;
  sessionTtlSeconds: number;
  enableDevRoutes: boolean;
};

export const loadEnv = (): AppConfig => {
  const result = envSchema.safeParse(process.env);
  if (result.success === false) {
    throw new Error(formatEnvErrors(result.error));
  }

  const logLevel =
    result.data.LOG_LEVEL ?? (result.data.NODE_ENV === 'production' ? 'info' : 'debug');
  const otpSecret = result.data.OTP_SECRET ?? result.data.JWT_SECRET;

  return Object.freeze({
    nodeEnv: result.data.NODE_ENV,
    databaseUrl: result.data.DATABASE_URL,
    redisUrl: result.data.REDIS_URL,
    port: result.data.PORT,
    logLevel,
    jwtSecret: result.data.JWT_SECRET,
    jwtIssuer: result.data.JWT_ISSUER,
    twilioAccountSid: result.data.TWILIO_ACCOUNT_SID,
    twilioAuthToken: result.data.TWILIO_AUTH_TOKEN,
    twilioVerifyServiceSid: result.data.TWILIO_VERIFY_SERVICE_SID,
    platformRootDomain: result.data.PLATFORM_ROOT_DOMAIN,
    mediaCdnBaseUrl: result.data.MEDIA_CDN_BASE_URL,
    mediaUploadBaseUrl: result.data.MEDIA_UPLOAD_BASE_URL,
    mediaUploadUrlTtlSeconds: result.data.MEDIA_UPLOAD_URL_TTL_SECONDS,
    mediaMaxFileBytes: result.data.MEDIA_MAX_FILE_BYTES,
    paymentDefaultProvider: result.data.PAYMENT_DEFAULT_PROVIDER,
    paymentReconciliationStaleMinutes: result.data.PAYMENT_RECONCILIATION_STALE_MINUTES,
    flwSecretKey: result.data.FLW_SECRET_KEY,
    flwWebhookSecretHash: result.data.FLW_WEBHOOK_SECRET_HASH,
    flwBaseUrl: result.data.FLW_BASE_URL,
    flwDefaultNetwork: result.data.FLW_DEFAULT_NETWORK,
    otpSecret,
    otpTtlSeconds: result.data.OTP_TTL_SECONDS,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS,
    enableDevRoutes: result.data.ENABLE_DEV_ROUTES
  });
};

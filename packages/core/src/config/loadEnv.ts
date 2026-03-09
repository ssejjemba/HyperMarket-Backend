import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, { message: 'Required' }).url({ message: 'Must be a valid URL' }),
  REDIS_URL: z.string().min(1, { message: 'Required' }).url({ message: 'Must be a valid URL' }),
  JWT_SECRET: z.string().min(1, { message: 'Required' }),
  JWT_ISSUER: z.string().min(1).optional(),
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
  otpSecret: string;
  otpTtlSeconds: number;
  sessionTtlSeconds: number;
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
    otpSecret,
    otpTtlSeconds: result.data.OTP_TTL_SECONDS,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS
  });
};

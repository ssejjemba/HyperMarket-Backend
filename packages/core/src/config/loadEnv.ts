import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, { message: 'Required' }).url({ message: 'Must be a valid URL' }),
  REDIS_URL: z.string().min(1, { message: 'Required' }).url({ message: 'Must be a valid URL' }),
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
};

export const loadEnv = (): AppConfig => {
  const result = envSchema.safeParse(process.env);
  if (result.success === false) {
    throw new Error(formatEnvErrors(result.error));
  }

  return Object.freeze({
    nodeEnv: result.data.NODE_ENV,
    databaseUrl: result.data.DATABASE_URL,
    redisUrl: result.data.REDIS_URL,
    port: result.data.PORT
  });
};

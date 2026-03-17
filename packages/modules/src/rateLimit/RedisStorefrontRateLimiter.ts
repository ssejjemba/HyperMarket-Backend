import Redis from 'ioredis';

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type StorefrontRateLimiter = {
  check(key: string): Promise<RateLimitDecision>;
  close(): Promise<void>;
};

type RedisEvalResult = [number, number];

type RedisLike = {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  quit(): Promise<unknown>;
};

const COUNTER_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9:+._-]/g, '_');

export const createRedisStorefrontRateLimiter = (
  input: {
    redisUrl: string;
    keyPrefix: string;
    max: number;
    windowSeconds: number;
  },
  deps: { redis?: RedisLike | undefined } = {}
): StorefrontRateLimiter => {
  const redis =
    deps.redis ??
    new Redis(input.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });

  return {
    async check(subject) {
      const key = `${input.keyPrefix}:${sanitize(subject)}`;
      const [count, ttl] = (await redis.eval(
        COUNTER_SCRIPT,
        1,
        key,
        input.windowSeconds
      )) as RedisEvalResult;

      if (Number(count) > input.max) {
        return {
          allowed: false,
          retryAfterSeconds: Number(ttl) > 0 ? Number(ttl) : input.windowSeconds
        };
      }

      return { allowed: true };
    },
    async close() {
      await redis.quit();
    }
  };
};

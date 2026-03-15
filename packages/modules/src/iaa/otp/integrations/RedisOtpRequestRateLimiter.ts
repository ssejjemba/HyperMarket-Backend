import Redis from 'ioredis';

import type { OtpChallengePolicy } from '../domain/OtpChallengePolicy';
import type { OtpRequestRateLimiter, RateLimitDecision } from './OtpRequestRateLimiter';

type RedisEvalResult = [number, number];

type RedisLike = {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
};

type WindowConfig = {
  name: string;
  max: number;
  windowSeconds: number;
};

type Config = {
  redisUrl: string;
  policy: OtpChallengePolicy;
  keyPrefix?: string | undefined;
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

const normalizeTtl = (ttlSeconds: number, fallbackSeconds: number): number => {
  return ttlSeconds > 0 ? ttlSeconds : fallbackSeconds;
};

const createWindowChecker =
  (
    redis: RedisLike,
    keyPrefix: string,
    scope: 'phone' | 'ip',
    windows: WindowConfig[]
  ): ((subject: string) => Promise<RateLimitDecision>) =>
  async (subject: string): Promise<RateLimitDecision> => {
    const subjectKey = sanitize(subject);

    for (const window of windows) {
      const key = `${keyPrefix}:${scope}:${window.name}:${subjectKey}`;
      const [count, ttl] = (await redis.eval(
        COUNTER_SCRIPT,
        1,
        key,
        window.windowSeconds
      )) as RedisEvalResult;

      if (Number(count) > window.max) {
        return {
          allowed: false,
          retryAfterSeconds: normalizeTtl(Number(ttl), window.windowSeconds)
        };
      }
    }

    return { allowed: true };
  };

export const createRedisOtpRequestRateLimiter = (
  config: Config,
  deps: { redis?: RedisLike | undefined } = {}
): OtpRequestRateLimiter => {
  const redis =
    deps.redis ??
    new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
  const keyPrefix = config.keyPrefix ?? 'iaa:otp:rate-limit';

  return {
    checkPhone: createWindowChecker(redis, keyPrefix, 'phone', [
      {
        name: 'burst',
        max: config.policy.phoneRateLimitBurstMaxChallenges,
        windowSeconds: config.policy.phoneRateLimitBurstWindowSeconds
      },
      {
        name: 'daily',
        max: config.policy.phoneRateLimitDailyMaxChallenges,
        windowSeconds: config.policy.phoneRateLimitDailyWindowSeconds
      }
    ]),
    checkIp: createWindowChecker(redis, keyPrefix, 'ip', [
      {
        name: 'default',
        max: config.policy.ipRateLimitMaxChallenges,
        windowSeconds: config.policy.ipRateLimitWindowSeconds
      }
    ])
  };
};

export type { RedisLike };

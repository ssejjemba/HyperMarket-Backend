import { describe, expect, it } from 'vitest';

import { OtpChallengePolicy, createRedisOtpRequestRateLimiter } from '@hypermarket/modules/iaa';
import type { RedisLike } from '@hypermarket/modules/iaa';

const POLICY = new OtpChallengePolicy({
  challengeTtlSeconds: 300,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  phoneRateLimitBurstWindowSeconds: 600,
  phoneRateLimitBurstMaxChallenges: 3,
  phoneRateLimitDailyWindowSeconds: 86_400,
  phoneRateLimitDailyMaxChallenges: 10,
  ipRateLimitWindowSeconds: 300,
  ipRateLimitMaxChallenges: 2
});

class FakeRedis implements RedisLike {
  private readonly state = new Map<string, { count: number; ttl: number }>();

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    windowSeconds: string | number
  ): Promise<[number, number]> {
    const ttl = Number(windowSeconds);
    const entry = this.state.get(key);

    if (entry === undefined) {
      const next = { count: 1, ttl };
      this.state.set(key, next);
      return [next.count, next.ttl];
    }

    entry.count += 1;
    return [entry.count, entry.ttl];
  }
}

describe('RedisOtpRequestRateLimiter', () => {
  it('triggers the phone burst limit after the configured threshold', async () => {
    const limiter = createRedisOtpRequestRateLimiter(
      {
        redisUrl: 'redis://127.0.0.1:6379',
        policy: POLICY
      },
      { redis: new FakeRedis() }
    );

    expect(await limiter.checkPhone('+256712345678')).toEqual({ allowed: true });
    expect(await limiter.checkPhone('+256712345678')).toEqual({ allowed: true });
    expect(await limiter.checkPhone('+256712345678')).toEqual({ allowed: true });
    expect(await limiter.checkPhone('+256712345678')).toEqual({
      allowed: false,
      retryAfterSeconds: 600
    });
  });

  it('triggers the ip limit after the configured threshold', async () => {
    const limiter = createRedisOtpRequestRateLimiter(
      {
        redisUrl: 'redis://127.0.0.1:6379',
        policy: POLICY
      },
      { redis: new FakeRedis() }
    );

    expect(await limiter.checkIp('127.0.0.1')).toEqual({ allowed: true });
    expect(await limiter.checkIp('127.0.0.1')).toEqual({ allowed: true });
    expect(await limiter.checkIp('127.0.0.1')).toEqual({
      allowed: false,
      retryAfterSeconds: 300
    });
  });
});

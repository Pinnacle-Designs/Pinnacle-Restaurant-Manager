import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();
const ratelimitCache = new Map<string, Ratelimit>();

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

function getDistributedLimiter(limit: number, windowMs: number): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;

  const cacheKey = `${limit}:${windowMs}`;
  let limiter = ratelimitCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      analytics: false,
      prefix: "pinnacle-rl",
    });
    ratelimitCache.set(cacheKey, limiter);
  }
  return limiter;
}

function memoryRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (bucket.count >= limit) {
    return true;
  }

  bucket.count += 1;
  return false;
}

/** Rate limit by key. Uses Upstash Redis when configured, otherwise in-memory (single instance). */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const distributed = getDistributedLimiter(limit, windowMs);
  if (distributed) {
    const { success } = await distributed.limit(key);
    return !success;
  }
  return memoryRateLimited(key, limit, windowMs);
}

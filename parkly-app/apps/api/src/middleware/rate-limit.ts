import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../lib/errors.js';

/** `reset` is epoch milliseconds when the window frees up. */
export interface RateLimiter {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
}

export const allowAllRateLimiter: RateLimiter = {
  limit: async () => ({ success: true, reset: 0 }),
};

/** Vercel sets x-forwarded-for; the first entry is the client. */
export function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() || 'unknown';
}

export function rateLimit(limiter: RateLimiter, now: () => Date): MiddlewareHandler {
  return async (c, next) => {
    const key = `ip:${clientIp(c.req.header('x-forwarded-for'))}`;
    const { success, reset } = await limiter.limit(key);
    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - now().getTime()) / 1000));
      throw new ApiError('RATE_LIMITED', undefined, {
        headers: { 'retry-after': String(retryAfter) },
      });
    }
    await next();
  };
}

import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../lib/errors.js';

export type LimitRule = { name: string; limit: number; windowSec: number };

/** `reset` is epoch milliseconds when the window frees up. */
export type LimitResult = { success: boolean; remaining: number; reset: number };

export interface RateLimiter {
  /** Counts one hit and reports whether it was allowed. */
  limit(key: string, rule: LimitRule): Promise<LimitResult>;
  /** Reports the state without counting a hit. */
  peek(key: string, rule: LimitRule): Promise<LimitResult>;
}

export const allowAllRateLimiter: RateLimiter = {
  limit: async (_key, rule) => ({ success: true, remaining: rule.limit, reset: 0 }),
  peek: async (_key, rule) => ({ success: true, remaining: rule.limit, reset: 0 }),
};

/** Fixed-window limiter for local dev and tests. Production uses Upstash. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly nowMs: () => number) {}

  async limit(key: string, rule: LimitRule) {
    const w = this.window(key, rule);
    if (w.count >= rule.limit) return this.result(w, rule);
    w.count += 1;
    return { ...this.result(w, rule), success: true };
  }

  async peek(key: string, rule: LimitRule) {
    return this.result(this.window(key, rule), rule);
  }

  private window(key: string, rule: LimitRule) {
    const id = `${rule.name}:${key}`;
    const now = this.nowMs();
    let w = this.windows.get(id);
    if (!w || now - w.start >= rule.windowSec * 1000) {
      w = { start: now, count: 0 };
      this.windows.set(id, w);
    }
    return w;
  }

  private result(w: { start: number; count: number }, rule: LimitRule): LimitResult {
    const remaining = Math.max(0, rule.limit - w.count);
    return { success: remaining > 0, remaining, reset: w.start + rule.windowSec * 1000 };
  }
}

/** Vercel sets x-forwarded-for; the first entry is the client. */
export function clientIp(header: string | undefined): string {
  return header?.split(',')[0]?.trim() || 'unknown';
}

export function retryAfterSec(reset: number, now: Date): string {
  return String(Math.max(1, Math.ceil((reset - now.getTime()) / 1000)));
}

/** Default per-IP budget for every route; tighter per-route rules live with their modules. */
export const IP_DEFAULT: LimitRule = { name: 'ip-default', limit: 120, windowSec: 60 };

export function rateLimit(limiter: RateLimiter, now: () => Date): MiddlewareHandler {
  return async (c, next) => {
    const { success, reset } = await limiter.limit(
      clientIp(c.req.header('x-forwarded-for')),
      IP_DEFAULT,
    );
    if (!success) {
      throw new ApiError('RATE_LIMITED', undefined, {
        headers: { 'retry-after': retryAfterSec(reset, now()) },
      });
    }
    await next();
  };
}

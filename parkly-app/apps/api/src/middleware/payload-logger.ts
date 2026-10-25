/* eslint-disable no-console */
import type { MiddlewareHandler } from 'hono';
import { maskPhone } from '../lib/logger.js';

export function sanitizePayload(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(sanitizePayload);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey === 'otp' ||
      lowerKey === 'authorization' ||
      lowerKey === 'cookie' ||
      lowerKey.includes('cardnumber') ||
      lowerKey.includes('accountnumber')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey === 'phone' && typeof val === 'string') {
      sanitized[key] = maskPhone(val);
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizePayload(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export function payloadLogger(): MiddlewareHandler {
  return async (c, next) => {
    // Skip noisy health checks from cluttering console
    if (c.req.path.startsWith('/health/')) {
      return next();
    }

    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const query = c.req.query();

    let reqBody: unknown = undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const contentType = c.req.header('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          reqBody = await c.req.raw.clone().json();
        } catch {
          // ignore unparseable or empty body
        }
      }
    }

    const reqId = c.req.header('x-request-id') ?? '';
    const hasQuery = Object.keys(query).length > 0;
    const hasBody = reqBody !== undefined;

    console.log(`\n\x1b[36m--> [API REQ] ${method} ${path}\x1b[0m${reqId ? ` (${reqId})` : ''}`);
    if (hasQuery) {
      console.log(`   \x1b[90mQuery:\x1b[0m`, JSON.stringify(query, null, 2));
    }
    if (hasBody) {
      console.log(`   \x1b[90mPayload:\x1b[0m`, JSON.stringify(sanitizePayload(reqBody), null, 2));
    }

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';

    let resBody: unknown = undefined;
    const resContentType = c.res.headers.get('content-type') ?? '';
    if (
      resContentType.includes('application/json') ||
      resContentType.includes('application/problem+json')
    ) {
      try {
        resBody = await c.res.clone().json();
      } catch {
        // ignore unparseable or streaming body
      }
    }

    console.log(`${statusColor}<-- [API RES] ${status} ${method} ${path} (${duration}ms)\x1b[0m`);
    if (resBody !== undefined) {
      console.log(`   \x1b[90mResponse:\x1b[0m`, JSON.stringify(sanitizePayload(resBody), null, 2));
    }
  };
}

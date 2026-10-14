import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { LiveSchema, ReadySchema, type Ready } from '@parkly/contracts';

export type ReadinessCheck = () => Promise<boolean>;

const CHECK_TIMEOUT_MS = 2_000;

async function runCheck(check: ReadinessCheck): Promise<'ok' | 'fail'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return (await Promise.race([check(), timeout])) ? 'ok' : 'fail';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

const live = createRoute({
  method: 'get',
  path: '/live',
  tags: ['ops'],
  responses: {
    200: { description: 'Process is up', content: { 'application/json': { schema: LiveSchema } } },
  },
});

const ready = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['ops'],
  responses: {
    200: {
      description: 'Dependencies reachable',
      content: { 'application/json': { schema: ReadySchema } },
    },
    503: {
      description: 'A dependency is down',
      content: { 'application/json': { schema: ReadySchema } },
    },
  },
});

export function healthRoutes(checks: Record<string, ReadinessCheck>) {
  return new OpenAPIHono()
    .openapi(live, (c) => c.json({ status: 'ok' as const }, 200))
    .openapi(ready, async (c) => {
      const entries = await Promise.all(
        Object.entries(checks).map(async ([name, check]) => [name, await runCheck(check)] as const),
      );
      const results: Ready['checks'] = Object.fromEntries(entries);
      const healthy = entries.every(([, r]) => r === 'ok');
      return healthy
        ? c.json({ status: 'ok' as const, checks: results }, 200)
        : c.json({ status: 'degraded' as const, checks: results }, 503);
    });
}

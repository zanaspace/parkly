import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { AppConfig } from './config/env.js';
import { jobRoutes, type JobHandler } from './jobs/routes.js';
import type { ReplayGuard } from './jobs/replay-guard.js';
import { ApiError } from './lib/errors.js';
import type { Logger } from './lib/logger.js';
import { problemResponse } from './lib/problem.js';
import { rateLimit, type RateLimiter } from './middleware/rate-limit.js';
import { healthRoutes, type ReadinessCheck } from './modules/health/routes.js';

export type AppDeps = {
  config: Pick<AppConfig, 'appEnv' | 'corsOrigins' | 'jobHmacSecret'>;
  logger: Logger;
  readinessChecks: Record<string, ReadinessCheck>;
  rateLimiter: RateLimiter;
  replayGuard: ReplayGuard;
  jobs: Record<string, JobHandler>;
  now: () => Date;
  /** Sentry in deployed envs; omitted locally and in tests. */
  reportError?: (err: unknown, ctx: { requestId: string | undefined; path: string }) => void;
};

export type AppEnv = { Variables: RequestIdVariables };

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ApiError('VALIDATION_FAILED', 'Request validation failed', {
          errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
    },
  });

  app.use(requestId());
  app.use(
    secureHeaders({
      xFrameOptions: 'DENY',
      strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      referrerPolicy: 'no-referrer',
    }),
  );
  app.use(
    cors({
      origin: (origin) => (deps.config.corsOrigins.includes(origin) ? origin : null),
      allowHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
      exposeHeaders: ['x-request-id', 'retry-after'],
      maxAge: 600,
    }),
  );

  // Signed by pg_cron; not rate limited by IP (Supabase egress is shared).
  app.route(
    '/internal/jobs',
    jobRoutes({
      secret: deps.config.jobHmacSecret,
      jobs: deps.jobs,
      replayGuard: deps.replayGuard,
      now: deps.now,
    }),
  );

  app.use('*', rateLimit(deps.rateLimiter, deps.now));
  app.route('/health', healthRoutes(deps.readinessChecks));

  app.notFound((c) => problemResponse(c, new ApiError('NOT_FOUND')));
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      if (err.status >= 500) {
        deps.logger.error({ err, requestId: c.get('requestId') }, err.code);
        deps.reportError?.(err, { requestId: c.get('requestId'), path: c.req.path });
      }
      return problemResponse(c, err);
    }
    deps.logger.error({ err, requestId: c.get('requestId'), path: c.req.path }, 'unhandled error');
    deps.reportError?.(err, { requestId: c.get('requestId'), path: c.req.path });
    return problemResponse(c, new ApiError('INTERNAL_ERROR'));
  });

  if (deps.config.appEnv !== 'prod') {
    app.doc31('/openapi.json', {
      openapi: '3.1.0',
      info: { title: 'Parkly API', version: '0.1.0' },
    });
  }

  return app;
}

export type App = ReturnType<typeof createApp>;

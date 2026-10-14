import { Hono } from 'hono';
import { ApiError } from '../lib/errors.js';
import type { ReplayGuard } from './replay-guard.js';
import { verifyJobSignature } from './signature.js';

export type JobResult = { processed: number; remaining: number };

/**
 * A job handles one bounded chunk and reports what is left; pg_cron calls it
 * again on the next tick (doc 01 §jobs). Handlers must be idempotent.
 */
export type JobHandler = (ctx: { payload: unknown; deadline: Date }) => Promise<JobResult>;

// Leave headroom under the Vercel function limit.
const JOB_BUDGET_MS = 50_000;
const REPLAY_TTL_SEC = 600;

export function jobRoutes(deps: {
  secret: string;
  jobs: Record<string, JobHandler>;
  replayGuard: ReplayGuard;
  now: () => Date;
}) {
  return new Hono().post('/:job', async (c) => {
    const job = c.req.param('job');
    const body = await c.req.text();
    const now = deps.now();
    const valid = verifyJobSignature({
      secret: deps.secret,
      job,
      body,
      timestamp: c.req.header('x-parkly-job-timestamp'),
      signature: c.req.header('x-parkly-job-signature'),
      nowSec: Math.floor(now.getTime() / 1000),
    });
    if (!valid) throw new ApiError('WEBHOOK_SIGNATURE_INVALID');

    const handler = Object.hasOwn(deps.jobs, job) ? deps.jobs[job] : undefined;
    if (!handler) throw new ApiError('NOT_FOUND', `Unknown job: ${job}`);

    const callId = c.req.header('x-parkly-job-id');
    if (!callId) throw new ApiError('VALIDATION_FAILED', 'x-parkly-job-id is required');
    if (!(await deps.replayGuard.firstSeen(`job:${job}:${callId}`, REPLAY_TTL_SEC))) {
      return c.json({ processed: 0, remaining: 0, duplicate: true }, 202);
    }

    const payload: unknown = body ? JSON.parse(body) : {};
    const result = await handler({ payload, deadline: new Date(now.getTime() + JOB_BUDGET_MS) });
    return c.json(result, 202);
  });
}

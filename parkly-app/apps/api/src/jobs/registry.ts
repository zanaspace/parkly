import type { JobHandler } from './routes.js';

/**
 * Every job pg_cron may call. Real jobs (expire holds, reconcile, permit
 * reminders, outbox drain) are added by their sprint; `ping` proves the wiring.
 */
export const jobs: Record<string, JobHandler> = {
  ping: async () => ({ processed: 0, remaining: 0 }),
};

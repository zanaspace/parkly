import type { Logger } from '../lib/logger.js';
import type { NotificationService } from '../notifications/service.js';
import type { EmailProvider, PaymentProvider, SettlementProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import { permitExpiryJob } from './permit-expiry.js';
import { reminderSweepJob } from './reminder-sweep.js';
import { settlePaymentsJob } from './settle-payments.js';
import { settlementsSyncJob } from './settlements-sync.js';
import type { JobHandler } from './routes.js';

/**
 * Every job pg_cron may call. Real jobs (expire holds, reconcile, permit
 * reminders, outbox drain) are added by their sprint; `ping` proves the wiring.
 */
export function createJobs(deps: {
  store: Store;
  email: EmailProvider;
  payments: PaymentProvider;
  settlement: SettlementProvider;
  logger: Logger;
  now: () => Date;
  appEnv: 'local' | 'dev' | 'staging' | 'prod';
  notifications: NotificationService;
}): Record<string, JobHandler> {
  return {
    ping: async () => ({ processed: 0, remaining: 0 }),
    'permit-expiry-check': permitExpiryJob({ ...deps, allowTimeTravel: deps.appEnv !== 'prod' }),
    'settle-payments': settlePaymentsJob(deps),
    'sweep-reminders': reminderSweepJob(deps),
    // Provider payouts into `settlements` and the ledger, hourly (S7 task 3).
    'settlements-sync': settlementsSyncJob(deps),
    // Sends queued notifications and retries failed channels (ADR 0020).
    'deliver-notifications': ({ deadline }) => deps.notifications.deliverDue({ deadline }),
  };
}

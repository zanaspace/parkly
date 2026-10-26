import type { Logger } from '../lib/logger.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

export function markNoShowsJob(deps: {
  store: Store;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async () => {
    try {
      const now = deps.now();
      const result = await deps.store.bookings.markNoShows(now);
      if (result.markedCount > 0) {
        deps.logger.info({ markedCount: result.markedCount }, 'Marked bookings as no-show');
      }
      return { processed: result.markedCount, remaining: 0 };
    } catch (err) {
      deps.logger.error({ err }, 'markNoShowsJob failed');
      return { processed: 0, remaining: 0 };
    }
  };
}

import type { Logger } from '../lib/logger.js';
import type { StorageProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const DAY_MS = 86_400_000;
/** Doc 06 section 4. */
export const RETENTION = {
  notificationsDays: 90,
  /** Doc 06 section 11: an export file is deleted after 7 days. */
  exportFilesDays: 7,
};
const CHUNK = 1000;

/**
 * Doc 06 section 4: nightly at 03:00 Lagos. Removes what has been kept long
 * enough: expired idempotency keys, the notification log after 90 days, and data
 * export files after 7 days. Each step takes at most 1,000 rows, so a long
 * backlog is cleared over a few nights and the job always finishes in time.
 * Repeating it changes nothing. The summary written to the audit log has counts only.
 * Not yet here: other policies in the doc 06 schedule, and skipping records under
 * a legal hold (holds are not built yet).
 */
export function retentionPurgeJob(deps: {
  store: Store;
  storage: StorageProvider;
  logger: Logger;
  now: () => Date;
}): JobHandler {
  return async () => {
    const now = deps.now();
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

    // A key is only kept to answer a repeated request; each row says when it expires.
    const idempotencyKeys = await deps.store.retention.purgeIdempotencyKeys(now, CHUNK);
    const notifications = await deps.store.retention.purgeNotifications(
      ago(RETENTION.notificationsDays),
      CHUNK,
    );

    let exportFiles = 0;
    const expired = await deps.store.dataRequests.expiredExports(
      ago(RETENTION.exportFilesDays),
      CHUNK,
    );
    for (const e of expired) {
      try {
        await deps.storage.remove({ bucket: 'exports', paths: [e.path] });
        await deps.store.dataRequests.clearExport(e.id);
        exportFiles += 1;
      } catch (err) {
        deps.logger.error({ err, requestId: e.id }, 'could not delete an expired export file');
      }
    }

    await deps.store.audit.write({
      actorUserId: null,
      actorRole: 'SYSTEM',
      action: 'retention.run',
      entityType: 'retention',
      entityId: null,
      after: { idempotencyKeys, notifications, exportFiles },
      ipHash: null,
      userAgent: null,
      requestId: null,
    });
    const total = idempotencyKeys + notifications + exportFiles;
    return {
      processed: total,
      remaining:
        idempotencyKeys === CHUNK || notifications === CHUNK || expired.length === CHUNK ? 1 : 0,
    };
  };
}

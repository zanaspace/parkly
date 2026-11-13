/**
 * Doc 06 §7 — Post-Restore Erasure Enforcement Script (`reapply-erasures`)
 *
 * Usage after restoring a Postgres backup (`pg_restore`) and BEFORE opening traffic:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/reapply-erasures.ts
 *
 * Ensures that any user whose account was erased after the backup timestamp
 * (and recorded in `erasure_log`) is immediately re-scrubbed so erased PII
 * never reappears from a restored snapshot.
 */
import { createDb } from '@parkly/db';
import { drizzleStore } from '../apps/api/src/store/drizzle.js';

export async function runReapplyErasures(databaseUrl = process.env.DATABASE_URL): Promise<{
  reapplied: number;
}> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run reapply-erasures');
  }
  const { db, client } = createDb(databaseUrl);
  try {
    const store = drizzleStore(db);
    const now = new Date();
    const result = await store.erasure.reapplyErasures(now);
    await store.audit.append({
      actorUserId: null,
      actorRole: 'SYSTEM',
      action: 'erasure.reapplied_after_restore',
      entityType: 'erasure_log',
      entityId: null,
      before: null,
      after: { reapplied: result.reapplied, executedAt: now.toISOString() },
      reason: 'Post-restore erasure log enforcement (doc 06 §7)',
      ipHash: null,
      userAgent: 'scripts/reapply-erasures.ts',
      requestId: null,
    });
    return result;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReapplyErasures()
    .then(({ reapplied }) => {
      console.log(JSON.stringify({ event: 'erasure.reapplied_after_restore', reapplied }));
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}

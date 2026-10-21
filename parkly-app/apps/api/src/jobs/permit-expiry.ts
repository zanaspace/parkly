import { checkLotTransition, listability, permitExpiryAction } from '@parkly/domain/lot';
import { lagosDateKey } from '@parkly/domain/time';
import type { Logger } from '../lib/logger.js';
import type { EmailProvider } from '../providers/index.js';
import { StaleVersionError, type LotRow, type PermitRow, type Store } from '../store/types.js';
import type { JobHandler } from './routes.js';

const BATCH = 100;
const SUSPEND_REASON = 'LASPA permit expired. Upload the renewed permit to go live again.';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function email(lot: LotRow, permit: PermitRow, kind: 'remind' | 'suspended', days?: number) {
  const subject =
    kind === 'remind'
      ? `Your LASPA permit for ${lot.name} expires in ${days} day${days === 1 ? '' : 's'}`
      : `${lot.name} is suspended: LASPA permit expired`;
  const text =
    kind === 'remind'
      ? `The LASPA permit ${permit.permitNumber} for ${lot.name} expires on ${permit.expiresAt}. Renew it with LASPA and upload the new permit on the Parkly portal so the lot stays live.`
      : `The LASPA permit ${permit.permitNumber} for ${lot.name} expired on ${permit.expiresAt}, so the lot is hidden from drivers. Upload the renewed permit on the Parkly portal; once Parkly approves it the lot can go live again.`;
  return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
}

/**
 * FR-LOT-007, doc 01 §5.8: daily at 06:00 Lagos. Sends the nearest 30/14/7/1-day
 * reminder not yet sent, expires permits on their expiry date and suspends
 * LIVE/PAUSED lots left without a valid permit (actor SYSTEM, audited).
 * Idempotent: reminders are recorded per permit and every change is conditional.
 */
export function permitExpiryJob(deps: {
  store: Store;
  email: EmailProvider;
  logger: Logger;
  now: () => Date;
  /** Outside production a signed call may pass `{ "asOf": "YYYY-MM-DD" }` to fast-forward (S2 demo). */
  allowTimeTravel: boolean;
}): JobHandler {
  const { store } = deps;

  async function notify(lot: LotRow, message: ReturnType<typeof email>) {
    const operator = await store.operators.find(lot.operatorId);
    if (!operator?.contactEmail) return;
    try {
      await deps.email.send({ to: operator.contactEmail, ...message });
    } catch (err) {
      // A failed email must not stop the suspension; the next run does not resend reminders.
      deps.logger.error({ err, lotId: lot.id }, 'permit expiry email failed');
    }
  }

  async function audit(action: string, entityType: string, entityId: string, after: unknown) {
    await store.audit.write({
      actorUserId: null,
      actorRole: 'SYSTEM',
      action,
      entityType,
      entityId,
      after,
      ipHash: null,
      userAgent: null,
      requestId: null,
    });
  }

  return async ({ payload, deadline }) => {
    const asOf = (payload as { asOf?: unknown } | null)?.asOf;
    const now =
      deps.allowTimeTravel && typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf)
        ? new Date(`${asOf}T06:00:00+01:00`)
        : deps.now();
    const today = lagosDateKey(now);
    const due = await store.permits.dueForExpiryCheck(today, BATCH);
    let processed = 0;

    for (const permit of due) {
      if (deps.now().getTime() > deadline.getTime()) break;
      processed++;
      const action = permitExpiryAction({
        expiresOn: permit.expiresAt,
        lastReminderDays: permit.lastReminderDays,
        now,
      });
      const [lot, latest] = await Promise.all([
        store.lots.findById(permit.lotId),
        store.permits.latest(permit.lotId),
      ]);
      // A newer permit replaced this one: no reminder, and only expire it.
      const current = latest?.id === permit.id;

      if (action.kind === 'remind') {
        if (lot && current && lot.status !== 'ARCHIVED')
          await notify(lot, email(lot, permit, 'remind', action.days));
        await store.permits.markReminded(permit.id, action.days);
        continue;
      }
      if (action.kind !== 'expire' || !(await store.permits.expire(permit.id))) continue;
      await audit('permit.expired', 'permit', permit.id, {
        lotId: permit.lotId,
        expiresAt: permit.expiresAt,
      });
      if (!lot || (lot.status !== 'LIVE' && lot.status !== 'PAUSED')) continue;

      // Suspend only if the lot is left without a valid permit (a renewal may already be approved).
      const after = current ? null : latest;
      const gate = listability({
        permit: after && { status: after.status, expiresOn: after.expiresAt },
        verification: { status: 'APPROVED', validUntil: '9999-12-31' },
        hasActiveRatePlan: true,
        operatorActive: true,
        now,
      });
      if (gate.listable) continue;
      const check = checkLotTransition({
        from: lot.status,
        to: 'SUSPENDED',
        actor: 'SYSTEM',
        facts: { submissionGaps: [], listability: gate, hasFutureBookings: false },
      });
      if (!check.ok) continue;
      try {
        await store.lots.setStatus(lot.operatorId, lot.id, lot.status, 'SUSPENDED', SUSPEND_REASON);
      } catch (err) {
        if (err instanceof StaleVersionError) continue; // moved meanwhile; next run re-checks
        throw err;
      }
      await audit('lot.suspended', 'lot', lot.id, {
        status: 'SUSPENDED',
        reason: 'PERMIT_EXPIRED',
        permitId: permit.id,
      });
      await notify(lot, email(lot, permit, 'suspended'));
    }

    const remaining = (await store.permits.dueForExpiryCheck(today, BATCH)).length;
    deps.logger.info({ job: 'permit-expiry-check', today, processed, remaining }, 'job done');
    return { processed, remaining };
  };
}

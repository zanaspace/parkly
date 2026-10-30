import type { Logger } from '../lib/logger.js';
import type { EmailProvider, PushProvider, SmsProvider } from '../providers/index.js';
import type { NotificationRow, Store } from '../store/types.js';
import { renderEmail, renderPush, renderSms, type TemplateLinks } from './templates.js';
import type { DispatchResult, NotificationChannel, NotificationEvent } from './types.js';

export interface NotificationServiceDeps {
  sms: SmsProvider;
  email: EmailProvider;
  push: PushProvider;
  store: Store;
  logger: Logger;
  /** Contact details and push tokens are stored encrypted (doc 06 §2). */
  crypto: { decrypt: (encrypted: string) => string };
  now: () => Date;
  /** Links in SMS and email; the driver website (WEB_BASE_URL). Local default otherwise. */
  links?: TemplateLinks;
}

/** FR-NOT-003: five attempts with exponential backoff (minutes after attempts 1–4). */
export const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 25, 120];
/** How long a claimed row stays hidden from other job runs while it is being sent. */
const LEASE_MS = 5 * 60_000;
const MINUTE_MS = 60_000;

/** Events that can wait for morning; everything else is time-bound (doc 20 S6 task 6). */
const NON_CRITICAL = new Set<NotificationEvent['key']>(['session.checked_out']);

/** Push first; SMS when it matters or push didn't land; email for confirmations and refunds. */
const SMS_ALWAYS = new Set<NotificationEvent['key']>([
  'booking.confirmed',
  'booking.cancelled',
  'booking.extended',
  'session.overstay_due',
]);
const SMS_IF_NO_PUSH = new Set<NotificationEvent['key']>([
  'booking.reminder_start',
  'booking.reminder_end',
]);
const EMAIL_EVENTS = new Set<NotificationEvent['key']>(['booking.confirmed', 'booking.cancelled']);

/** 22:00–07:00 in Lagos (UTC+1, no daylight saving): the next 07:00, else null. */
export function quietHoursEnd(now: Date): Date | null {
  const lagos = new Date(now.getTime() + 60 * MINUTE_MS);
  const hour = lagos.getUTCHours();
  if (hour >= 7 && hour < 22) return null;
  const day = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  const sevenLagos = day + 6 * 60 * MINUTE_MS; // 07:00 Lagos is 06:00 UTC
  return new Date(hour >= 22 ? sevenLagos + 24 * 60 * MINUTE_MS : sevenLagos);
}

export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  /**
   * Queues an event for delivery (ADR 0020). Repeats with the same dedupe key
   * are ignored. Never throws: a notification must not break the action that
   * caused it.
   */
  async notify(event: NotificationEvent, dedupeKey = `${event.key}:${event.bookingId}`) {
    const now = this.deps.now();
    try {
      await this.deps.store.notifications.enqueue({
        userId: event.driverId,
        bookingId: event.bookingId,
        eventKey: event.key,
        dedupeKey,
        payload: event,
        notBefore: (NON_CRITICAL.has(event.key) && quietHoursEnd(now)) || now,
      });
    } catch (err) {
      this.deps.logger.error({ err, eventKey: event.key }, 'notification enqueue failed');
    }
  }

  /** Sends due notifications until the deadline; failed channels are retried later. */
  async deliverDue(opts: { deadline: Date; limit?: number }) {
    const now = this.deps.now();
    const rows = await this.deps.store.notifications.claimDue(
      now,
      opts.limit ?? 50,
      new Date(now.getTime() + LEASE_MS),
    );
    let processed = 0;
    for (const row of rows) {
      // Unprocessed rows keep their lease and come due again after it.
      if (this.deps.now() >= opts.deadline) break;
      await this.deliver(row);
      processed += 1;
    }
    return { processed, remaining: rows.length - processed };
  }

  private async deliver(row: NotificationRow) {
    const result = await this.dispatch(
      row.payload as NotificationEvent,
      row.channelsDone as NotificationChannel[],
    );
    const now = this.deps.now();
    const channelsDone = [...new Set([...row.channelsDone, ...result.deliveredChannels])];
    const failed = result.failedChannels.length > 0;
    const exhausted = row.attempts >= MAX_ATTEMPTS;
    const backoff = BACKOFF_MIN[Math.min(row.attempts, BACKOFF_MIN.length) - 1] ?? 1;
    await this.deps.store.notifications.finish(row.id, {
      status: !failed
        ? channelsDone.length > 0
          ? 'SENT'
          : 'SKIPPED'
        : exhausted
          ? 'FAILED'
          : 'PENDING',
      channelsDone,
      nextAttemptAt: failed && !exhausted ? new Date(now.getTime() + backoff * MINUTE_MS) : now,
      lastError: failed ? `failed: ${result.failedChannels.join(', ')}` : null,
      sentAt: channelsDone.length > 0 ? now : null,
    });
  }

  /** Sends one event on every channel it needs, except those in `skip` (already delivered). */
  async dispatch(
    event: NotificationEvent,
    skip: NotificationChannel[] = [],
  ): Promise<DispatchResult> {
    const deliveredChannels: NotificationChannel[] = [];
    const failedChannels: NotificationChannel[] = [];
    const log = { eventKey: event.key, bookingId: event.bookingId };

    const contact = await this.deps.store.users.contact(event.driverId);
    const phone = this.reveal(contact?.phoneEnc);
    const email = this.reveal(contact?.emailEnc);
    const tokens = (await this.deps.store.devices.pushTokens(event.driverId)).flatMap((t) => {
      const token = this.reveal(t);
      return token ? [token] : [];
    });

    let pushDelivered = skip.includes('PUSH');
    const pushMsg = !pushDelivered ? renderPush(event, tokens) : null;
    if (pushMsg) {
      try {
        const res = await this.deps.push.send(pushMsg);
        if (res.delivered > 0) {
          pushDelivered = true;
          deliveredChannels.push('PUSH');
          // Every device is gone (app uninstalled): nothing to retry.
        } else if (res.invalidTokens.length < pushMsg.tokens.length) failedChannels.push('PUSH');
      } catch (err) {
        this.deps.logger.error({ err, ...log }, 'push notification failed');
        failedChannels.push('PUSH');
      }
    }

    const wantsSms = SMS_ALWAYS.has(event.key) || (SMS_IF_NO_PUSH.has(event.key) && !pushDelivered);
    const smsMsg =
      wantsSms && phone && !skip.includes('SMS') ? renderSms(event, phone, this.deps.links) : null;
    if (smsMsg) {
      try {
        await this.deps.sms.send({ to: smsMsg.to, body: smsMsg.body, kind: 'TRANSACTIONAL' });
        deliveredChannels.push('SMS');
      } catch (err) {
        this.deps.logger.error({ err, ...log }, 'SMS notification failed');
        failedChannels.push('SMS');
      }
    }

    const emailMsg =
      EMAIL_EVENTS.has(event.key) && email && !skip.includes('EMAIL')
        ? renderEmail(event, email, this.deps.links)
        : null;
    if (emailMsg) {
      try {
        await this.deps.email.send(emailMsg);
        deliveredChannels.push('EMAIL');
      } catch (err) {
        this.deps.logger.error({ err, ...log }, 'email notification failed');
        failedChannels.push('EMAIL');
      }
    }

    // A push that reached no device isn't a failure worth retrying when SMS covered it.
    if (pushDelivered === false && deliveredChannels.includes('SMS')) {
      const i = failedChannels.indexOf('PUSH');
      if (i >= 0) failedChannels.splice(i, 1);
    }

    this.deps.logger.info({ ...log, deliveredChannels, failedChannels }, 'notification dispatched');
    return { deliveredChannels, failedChannels };
  }

  /** Decrypts a stored value; null when absent or unreadable (e.g. after key rotation). */
  private reveal(encrypted: string | null | undefined): string | null {
    if (!encrypted) return null;
    try {
      return this.deps.crypto.decrypt(encrypted);
    } catch {
      return null;
    }
  }
}

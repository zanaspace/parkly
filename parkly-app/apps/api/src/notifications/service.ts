import { randomUUID } from 'node:crypto';
import type { Logger } from '../lib/logger.js';
import type { EmailProvider, PushProvider, SmsProvider } from '../providers/index.js';
import type { Store } from '../store/types.js';
import { renderEmail, renderPush, renderSms } from './templates.js';
import type { DispatchResult, NotificationChannel, NotificationEvent } from './types.js';

export interface NotificationServiceDeps {
  sms: SmsProvider;
  email: EmailProvider;
  push: PushProvider;
  store: Store;
  logger: Logger;
  crypto?: { decrypt: (encrypted: string) => string };
}

export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  async dispatch(event: NotificationEvent): Promise<DispatchResult> {
    const eventId = randomUUID();
    const deliveredChannels: NotificationChannel[] = [];
    const failedChannels: NotificationChannel[] = [];

    const user = await this.deps.store.users.find(event.driverId);
    const u = user as unknown as {
      phoneEnc?: string;
      emailEnc?: string;
      phone?: string;
      email?: string;
    } | null;

    // Resolve phone
    let phone: string | null = null;
    if (u?.phoneEnc && this.deps.crypto) {
      try {
        phone = this.deps.crypto.decrypt(u.phoneEnc);
      } catch {
        phone = null;
      }
    } else if (u?.phone) {
      phone = u.phone;
    }

    // Resolve email
    let email: string | null = null;
    if (u?.emailEnc && this.deps.crypto) {
      try {
        email = this.deps.crypto.decrypt(u.emailEnc);
      } catch {
        email = null;
      }
    } else if (u?.email) {
      email = u.email;
    }

    // Resolve push tokens from devices
    const pushTokens: string[] = [];
    try {
      const memStore = this.deps.store as unknown as {
        deviceRows?: { userId: string; pushTokenEnc?: string; revokedAt: Date | null }[];
      };
      if (Array.isArray(memStore.deviceRows)) {
        for (const d of memStore.deviceRows) {
          if (d.userId === event.driverId && !d.revokedAt && d.pushTokenEnc) {
            let token = d.pushTokenEnc;
            if (this.deps.crypto) {
              try {
                token = this.deps.crypto.decrypt(d.pushTokenEnc);
              } catch {
                // Ignore decrypt failure
              }
            }
            if (token) pushTokens.push(token);
          }
        }
      }
    } catch {
      // Ignore device lookup errors
    }

    // 1. Send Push
    let pushDelivered = false;
    const pushMsg = renderPush(event, pushTokens);
    if (pushMsg && pushTokens.length > 0) {
      try {
        const result = await this.deps.push.send(pushMsg);
        if (result.delivered > 0) {
          pushDelivered = true;
          deliveredChannels.push('PUSH');
        } else {
          failedChannels.push('PUSH');
        }
      } catch (err) {
        this.deps.logger.error({ err, eventId, eventKey: event.key }, 'Push notification failed');
        failedChannels.push('PUSH');
      }
    }

    // 2. Send SMS
    // For reminder_start: only if push failed or no tokens (SMS fallback)
    const shouldSendSms =
      phone &&
      (event.key === 'booking.confirmed' ||
        event.key === 'booking.cancelled' ||
        event.key === 'booking.extended' ||
        event.key === 'session.overstay_due' ||
        ((event.key === 'booking.reminder_start' || event.key === 'booking.reminder_end') &&
          !pushDelivered));

    if (shouldSendSms && phone) {
      const smsMsg = renderSms(event, phone);
      if (smsMsg) {
        try {
          await this.deps.sms.send({
            to: smsMsg.to,
            body: smsMsg.body,
            kind: 'TRANSACTIONAL',
          });
          deliveredChannels.push('SMS');
        } catch (err) {
          this.deps.logger.error({ err, eventId, eventKey: event.key }, 'SMS notification failed');
          failedChannels.push('SMS');
        }
      }
    }

    // 3. Send Email
    const shouldSendEmail =
      email && (event.key === 'booking.confirmed' || event.key === 'booking.cancelled');

    if (shouldSendEmail && email) {
      const emailMsg = renderEmail(event, email);
      if (emailMsg) {
        try {
          await this.deps.email.send(emailMsg);
          deliveredChannels.push('EMAIL');
        } catch (err) {
          this.deps.logger.error(
            { err, eventId, eventKey: event.key },
            'Email notification failed',
          );
          failedChannels.push('EMAIL');
        }
      }
    }

    this.deps.logger.info(
      { eventId, eventKey: event.key, deliveredChannels, failedChannels },
      'Notification dispatched',
    );

    return { eventId, deliveredChannels, failedChannels };
  }
}

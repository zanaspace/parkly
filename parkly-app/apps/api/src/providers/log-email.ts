import type { Logger } from '../lib/logger.js';
import type { EmailProvider } from './index.js';

/**
 * Until the email provider (Resend) arrives with notifications in S6, emails
 * are only logged: the subject and the recipient's domain, never the address.
 */
export function logOnlyEmail(logger: Logger): EmailProvider {
  let n = 0;
  return {
    async send({ to, subject }) {
      logger.info(
        { toDomain: to.split('@')[1] ?? 'unknown', subject },
        'email not sent (log only)',
      );
      return { providerMessageId: `log_${++n}` };
    },
  };
}

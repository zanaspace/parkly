import type { EmailProvider } from './index.js';

/**
 * Resend transactional email (FR-NOT-001, doc 05 sub-processors). The sending
 * domain must be verified in Resend, or it only delivers to the account owner.
 * Errors never include the recipient.
 */
export function resendEmailProvider(options: {
  apiKey: string;
  /** e.g. `Parkly <no-reply@parkly.example>`, on the verified domain. */
  from: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): EmailProvider {
  const doFetch = options.fetch ?? fetch;
  const url = `${(options.baseUrl ?? 'https://api.resend.com').replace(/\/$/, '')}/emails`;
  return {
    async send({ to, subject, html, text }) {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: options.from, to: [to], subject, html, text }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok || !data.id) throw new Error(`resend send failed: HTTP ${res.status}`);
      return { providerMessageId: data.id };
    },
  };
}

import type { SmsProvider } from './index.js';

/**
 * Termii SMS (Nigeria). OTPs go on the DND route so they reach numbers on the
 * Do-Not-Disturb register (doc 05 §4.1). Errors never include the number or
 * message body, because the body can contain an OTP.
 */
export function termiiSmsProvider(options: {
  apiKey: string;
  senderId: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): SmsProvider {
  const doFetch = options.fetch ?? fetch;
  const url = `${(options.baseUrl ?? 'https://v3.api.termii.com').replace(/\/$/, '')}/api/sms/send`;
  return {
    name: 'termii',
    async send({ to, body, kind }) {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: options.apiKey,
          to: to.replace(/^\+/, ''),
          from: options.senderId,
          sms: body,
          type: 'plain',
          channel: kind === 'OTP' ? 'dnd' : 'generic',
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      });
      const data = (await res.json().catch(() => ({}))) as { message_id?: string; code?: string };
      if (!res.ok || !data.message_id) throw new Error(`termii send failed: HTTP ${res.status}`);
      return { providerMessageId: data.message_id };
    },
  };
}

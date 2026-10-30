import type { PushProvider } from './index.js';

type Ticket = { status: 'ok'; id: string } | { status: 'error'; details?: { error?: string } };

/**
 * Expo push service (FR-NOT-001): one message per device token. A ticket of
 * DeviceNotRegistered means the app was uninstalled or the token expired.
 * The access token is optional; set it once "enhanced security" is on in Expo.
 */
export function expoPushProvider(options: {
  accessToken?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): PushProvider {
  const doFetch = options.fetch ?? fetch;
  const url = `${(options.baseUrl ?? 'https://exp.host').replace(/\/$/, '')}/--/api/v2/push/send`;
  return {
    async send({ tokens, title, body, data }) {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify(
          tokens.map((to) => ({ to, title, body, ...(data ? { data } : {}), sound: 'default' })),
        ),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      if (!res.ok) throw new Error(`expo push failed: HTTP ${res.status}`);
      const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
      return {
        delivered: tickets.filter((t) => t.status === 'ok').length,
        invalidTokens: tokens.filter((_, i) => {
          const t = tickets[i];
          return t?.status === 'error' && t.details?.error === 'DeviceNotRegistered';
        }),
      };
    },
  };
}

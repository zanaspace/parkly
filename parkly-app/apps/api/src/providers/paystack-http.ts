/** Options shared by the Paystack adapters. */
export type PaystackOptions = {
  secretKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * One Paystack API call. Errors carry only the method, path and status: never
 * the response body, account numbers or the key.
 */
export function paystackHttp(options: PaystackOptions) {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? 'https://api.paystack.co').replace(/\/$/, '');

  return async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    init: { query?: Record<string, string>; body?: unknown; allow?: number[] } = {},
  ): Promise<{ status: number; data: T | null }> {
    const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
    const res = await doFetch(`${base}${path}${qs}`, {
      method,
      headers: {
        authorization: `Bearer ${options.secretKey}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    if (init.allow?.includes(res.status)) return { status: res.status, data: null };
    const json = (await res.json().catch(() => null)) as { status?: boolean; data?: T } | null;
    if (!res.ok || !json?.status || json.data === undefined)
      throw new Error(`paystack ${method} ${path} failed: HTTP ${res.status}`);
    return { status: res.status, data: json.data };
  };
}

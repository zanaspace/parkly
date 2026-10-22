import { ERROR_STATUS, type ErrorCode } from '@parkly/contracts';

/** The Parkly API base URL (public). */
export const apiUrl = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** A problem+json error from the API (doc 02 §11). */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
  ) {
    super(code);
    this.name = 'ApiProblem';
  }
}

/**
 * Server-side call to a public API endpoint. `revalidate` lets Next cache a
 * response for that many seconds (lot pages); search is never cached.
 */
export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; revalidate?: number } = {},
): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method: init.method ?? 'GET',
    ...(init.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } }
      : {}),
    ...(init.revalidate ? { next: { revalidate: init.revalidate } } : { cache: 'no-store' }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { code?: unknown } | null)?.code;
    throw new ApiProblem(
      res.status,
      typeof code === 'string' && code in ERROR_STATUS ? (code as ErrorCode) : 'UNKNOWN',
    );
  }
  return body as T;
}

/** Server-side call as the signed-in driver. Never cached. */
export async function apiAs<T>(
  accessToken: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { code?: unknown } | null)?.code;
    throw new ApiProblem(
      res.status,
      typeof code === 'string' && code in ERROR_STATUS ? (code as ErrorCode) : 'UNKNOWN',
    );
  }
  return body as T;
}

import { ERROR_STATUS, type ErrorCode } from '@parkly/contracts';

/** A problem+json error from the Parkly API (doc 02 §11). */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'ApiProblem';
  }
}

/** Turns any failed response body into an ApiProblem with a known code. */
export function parseProblem(status: number, body: unknown): ApiProblem {
  const b = (typeof body === 'object' && body !== null ? body : {}) as {
    code?: unknown;
    detail?: unknown;
  };
  const code =
    typeof b.code === 'string' && b.code in ERROR_STATUS ? (b.code as ErrorCode) : 'UNKNOWN';
  const detail = typeof b.detail === 'string' ? b.detail : undefined;
  return new ApiProblem(status, code, detail);
}

/** Server-side call to the Parkly API with the user's access token. */
export async function apiFetch<T>(
  apiUrl: string,
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw parseProblem(res.status, body);
  return body as T;
}

import { ERROR_STATUS, type ErrorCode } from '@parkly/contracts';

/** A problem+json error from the Parkly API (doc 02 §11). */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    readonly detail?: string,
    /** Field-level problems for VALIDATION_FAILED (`path` is the request field). */
    readonly errors?: { path: string; message: string }[],
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
    errors?: unknown;
  };
  const code =
    typeof b.code === 'string' && b.code in ERROR_STATUS ? (b.code as ErrorCode) : 'UNKNOWN';
  const detail = typeof b.detail === 'string' ? b.detail : undefined;
  const errors = Array.isArray(b.errors)
    ? b.errors.filter(
        (e): e is { path: string; message: string } =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as { path?: unknown }).path === 'string' &&
          typeof (e as { message?: unknown }).message === 'string',
      )
    : undefined;
  return new ApiProblem(status, code, detail, errors);
}

/** Server-side call to the Parkly API with the user's access token. */
export async function apiFetch<T>(
  apiUrl: string,
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TypeError' || err.message.includes('fetch failed'))) {
      throw new Error(
        `Failed to reach the Parkly API at ${apiUrl}. Please ensure the API server is running on port 4000 (pnpm --filter @parkly/api dev).`,
        { cause: err },
      );
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw parseProblem(res.status, body);
  return body as T;
}

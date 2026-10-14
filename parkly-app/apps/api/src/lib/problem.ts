import type { Problem } from '@parkly/contracts';
import type { Context } from 'hono';
import type { ApiError } from './errors.js';

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable',
  429: 'Too many requests',
  500: 'Internal error',
  502: 'Upstream unavailable',
  503: 'Service unavailable',
};

export function problemResponse(c: Context, error: ApiError): Response {
  const requestId = c.get('requestId') as string | undefined;
  const body: Problem = {
    type: `https://docs.parkly.example/errors/${error.code}`,
    title: TITLES[error.status] ?? 'Error',
    status: error.status,
    code: error.code,
    instance: c.req.path,
    ...(error.detail ? { detail: error.detail } : {}),
    ...(requestId ? { requestId } : {}),
    ...(error.errors ? { errors: error.errors } : {}),
  };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: {
      'content-type': 'application/problem+json',
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...error.headers,
    },
  });
}

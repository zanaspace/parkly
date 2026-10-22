import { apiUrl } from '../../../lib/api';

/**
 * Same-origin proxy for place suggestions, so the browser never needs the
 * API's CORS allow-list (and works on any preview host). Only `q` is forwarded.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 100) return Response.json({ items: [] });
  const res = await fetch(`${apiUrl()}/v1/places/autocomplete?q=${encodeURIComponent(q)}`, {
    headers: {
      accept: 'application/json',
      // Keep the API's per-IP rate limit meaningful behind this proxy.
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
    },
    next: { revalidate: 86400 },
  });
  const body: unknown = await res.json().catch(() => ({ items: [] }));
  return Response.json(body, { status: res.ok ? 200 : res.status });
}

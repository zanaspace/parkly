import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '../auth/session';
import { publicEnv } from '../env';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Same-origin bridge for a finance download (CSV or PDF), like the bookings
 * export: the access token stays in the session cookie and never reaches the
 * browser. The API checks the role, audits the download and stamps it. A
 * refusal goes back to the finance page with its code under `errorKey`.
 */
export async function proxyDownload(
  req: NextRequest,
  apiPath: string,
  query: URLSearchParams,
  back: { query: URLSearchParams; errorKey: string },
): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/sign-in', req.url));

  const res = await fetch(`${publicEnv().apiUrl}${apiPath}?${query.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: unknown };
    back.query.set(back.errorKey, typeof body.code === 'string' ? body.code : 'UNKNOWN');
    return NextResponse.redirect(new URL(`/finance?${back.query.toString()}`, req.url));
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      'cache-control': 'no-store',
    },
  });
}

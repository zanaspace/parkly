import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '../../../../../../lib/auth/session';
import { publicEnv } from '../../../../../../lib/env';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only the filters are passed on (FR-OPS-002). */
const KEYS = ['from', 'to', 'lotId', 'status'] as const;

/**
 * FR-OPS-002: the "Download CSV" link. Same-origin bridge like the occupancy
 * route: the token stays in the session cookie. The API checks the role,
 * audits the export and stamps the file with who exported it. A refusal (too
 * many rows, bad dates) goes back to the bookings page with its code.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ operatorId: string }> }) {
  const { operatorId } = await ctx.params;
  if (!UUID.test(operatorId)) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });

  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/sign-in', req.url));

  const q = new URLSearchParams();
  for (const k of KEYS) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) q.set(k, v);
  }
  const res = await fetch(
    `${publicEnv().apiUrl}/v1/operators/${operatorId}/bookings/export?${q.toString()}`,
    { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === 'string' ? body.code : 'UNKNOWN';
    q.set('exportError', code);
    return NextResponse.redirect(new URL(`/bookings?${q.toString()}`, req.url));
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      'cache-control': 'no-store',
    },
  });
}

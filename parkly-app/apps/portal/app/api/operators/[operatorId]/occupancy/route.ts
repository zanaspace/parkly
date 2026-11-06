import { NextResponse } from 'next/server';
import { getAccessToken } from '../../../../../lib/auth/session';
import { publicEnv } from '../../../../../lib/env';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FR-OPS-001: the dashboard polls this every 15 s for live occupancy. Same-origin
 * bridge, like /attend/api: the access token stays in the httpOnly session
 * cookie and is added here. The API checks the operator and the caller's role.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ operatorId: string }> }) {
  const { operatorId } = await ctx.params;
  if (!UUID.test(operatorId)) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });

  const token = await getAccessToken();
  if (!token) return NextResponse.json({ code: 'AUTH_REQUIRED' }, { status: 401 });

  const res = await fetch(`${publicEnv().apiUrl}/v1/operators/${operatorId}/occupancy`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

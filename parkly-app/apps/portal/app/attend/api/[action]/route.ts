import { NextResponse, type NextRequest } from 'next/server';
import { loadSession } from '../../../../lib/auth/session';
import { publicEnv } from '../../../../lib/env';

/**
 * Same-origin bridge from the attendant app to the Parkly API (ADR 0005).
 * The page never sees the access token: it stays in the httpOnly session
 * cookie, and this handler adds it. Only these four calls are passed on.
 */
const ROUTES = {
  lots: { method: 'GET', path: () => '/v1/attend/lots' },
  devices: { method: 'POST', path: () => '/v1/attend/devices' },
  manifest: {
    method: 'GET',
    path: (q: URLSearchParams) => {
      const lotId = q.get('lotId') ?? '';
      const device = q.get('clientDeviceId') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(lotId) || !/^[0-9a-f-]{36}$/i.test(device)) return null;
      return `/v1/attend/lots/${lotId}/manifest?clientDeviceId=${device}`;
    },
  },
  sync: { method: 'POST', path: () => '/v1/attend/sync' },
} as const;

type Action = keyof typeof ROUTES;

async function forward(req: NextRequest, action: string) {
  const route = (ROUTES as Record<string, (typeof ROUTES)[Action]>)[action];
  if (!route || route.method !== req.method)
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  const path = route.path(req.nextUrl.searchParams);
  if (!path) return NextResponse.json({ code: 'VALIDATION_FAILED' }, { status: 400 });

  const session = await loadSession();
  if (!session.signedIn) return NextResponse.json({ code: 'AUTH_REQUIRED' }, { status: 401 });

  const res = await fetch(`${publicEnv().apiUrl}${path}`, {
    method: route.method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(route.method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(route.method === 'POST' ? { body: await req.text() } : {}),
    cache: 'no-store',
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  return forward(req, (await ctx.params).action);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  return forward(req, (await ctx.params).action);
}

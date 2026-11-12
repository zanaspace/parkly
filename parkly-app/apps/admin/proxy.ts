import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from './lib/env';
import {
  isSignedOutPath,
  networkAllowed,
  SEEN_COOKIE,
  sessionDecision,
  START_COOKIE,
} from './lib/security/session-guard';
import { authCookieOptions } from './lib/supabase/cookies';

const TWELVE_HOURS_SEC = 12 * 60 * 60;

/**
 * Admin hardening (doc 05 section 4.6, S8 task 7) and session refresh, on every request
 * (Next 16 renamed `middleware` to `proxy`). In order:
 * 1. The console only opens from the allowed networks (`ADMIN_IP_ALLOWLIST`; empty = off).
 * 2. An admin idle for more than 15 minutes, or signed in for more than 12 hours, is signed
 *    out and sent to the sign-in page with the reason.
 * 3. Otherwise the Supabase session is refreshed and the activity time is recorded.
 * Access decisions by role are made in the protected layout, not here.
 */
export async function proxy(request: NextRequest) {
  if (!networkAllowed(process.env.ADMIN_IP_ALLOWLIST, request.headers.get('x-forwarded-for'))) {
    return new NextResponse('The admin console is only available from the Parkly office network.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  let response = NextResponse.next({ request });
  let env: ReturnType<typeof publicEnv>;
  try {
    env = publicEnv();
  } catch {
    // Not configured (e.g. fresh checkout): public pages still render; protected pages report the missing env.
    return response;
  }
  const { supabaseUrl, supabaseKey } = env;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Validates the JWT and refreshes it if needed. Do not add logic between
  // creating the client and this call (Supabase SSR guidance).
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return response;

  // Prefetches are the browser guessing, not the admin acting: they neither count as
  // activity nor end a session.
  const prefetch =
    request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch';
  if (prefetch) return response;

  const now = Date.now();
  const { state, startedMs } = sessionDecision(
    {
      seen: request.cookies.get(SEEN_COOKIE)?.value,
      start: request.cookies.get(START_COOKIE)?.value,
    },
    now,
  );

  if (state !== 'ok' && !isSignedOutPath(request.nextUrl.pathname)) {
    await supabase.auth.signOut();
    const to = request.nextUrl.clone();
    to.pathname = '/sign-in';
    to.search = `?reason=${state}`;
    const redirect = NextResponse.redirect(to);
    // Carry over the cookies signOut cleared, and drop ours.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.cookies.delete(SEEN_COOKIE);
    redirect.cookies.delete(START_COOKIE);
    redirect.headers.set('cache-control', 'no-store');
    return redirect;
  }

  const options = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: TWELVE_HOURS_SEC,
  };
  response.cookies.set(SEEN_COOKIE, String(now), options);
  response.cookies.set(START_COOKIE, String(startedMs), options);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from './lib/env';
import { authCookieOptions } from './lib/supabase/cookies';

/**
 * Refreshes the Supabase session on every request and writes rotated tokens
 * back to cookies (Next 16 renamed `middleware` to `proxy`). Access decisions
 * are made in the protected layout, not here.
 */
export async function proxy(request: NextRequest) {
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
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

import type { Me } from '@parkly/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiAs, ApiProblem } from './api';
import { getOrCreateDeviceId } from './auth/device';
import { createClient } from './supabase/server';

export type Driver = { userId: string; accessToken: string; me?: Me };

/** The signed-in driver, or null. getClaims verifies the JWT; never trust getSession alone. */
export async function loadDriver(): Promise<Driver | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      return { userId: String(claims.claims.sub), accessToken: session.access_token };
    }
  }

  // Check for corporate fleet driver session cookie
  const cookieStore = await cookies();
  const corpCookie = cookieStore.get('pk_corp_driver')?.value;
  if (corpCookie) {
    try {
      const parsed = JSON.parse(corpCookie) as { token?: string; userId?: string };
      if (parsed.token && parsed.userId) {
        return { userId: parsed.userId, accessToken: parsed.token };
      }
    } catch {
      // ignore malformed cookie
    }
  }

  return null;
}

/**
 * Pages that need a driver send everyone else to sign in, then back here.
 * Ensuring the user is bootstrapped with asDriver: true grants the DRIVER role
 * so that bookings and vehicle endpoints succeed (ADR 0015).
 */
export async function requireDriver(next: string): Promise<Driver> {
  const driver = await loadDriver();
  if (!driver) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  try {
    const { user } = await apiAs<{ user: Me }>(driver.accessToken, '/v1/auth/bootstrap', {
      method: 'POST',
      body: { deviceId: await getOrCreateDeviceId(), platform: 'WEB', asDriver: true },
    });
    return { ...driver, me: user };
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 401 || err.status === 403)) {
      const supabase = await createClient();
      await supabase.auth.signOut({ scope: 'local' });
      const cookieStore = await cookies();
      cookieStore.delete('pk_corp_driver');
      redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    }
    throw err;
  }
}

/** Only same-site paths after sign-in (no open redirects). */
export function safeNext(next: string | undefined, fallback = '/bookings'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

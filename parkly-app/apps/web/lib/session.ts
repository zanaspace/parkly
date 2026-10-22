import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type Driver = { userId: string; accessToken: string };

/** The signed-in driver, or null. getClaims verifies the JWT; never trust getSession alone. */
export async function loadDriver(): Promise<Driver | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  return { userId: String(claims.claims.sub), accessToken: session.access_token };
}

/** Pages that need a driver send everyone else to sign in, then back here. */
export async function requireDriver(next: string): Promise<Driver> {
  const driver = await loadDriver();
  if (!driver) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return driver;
}

/** Only same-site paths after sign-in (no open redirects). */
export function safeNext(next: string | undefined, fallback = '/bookings'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

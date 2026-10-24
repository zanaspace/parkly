import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

const DEVICE_COOKIE = 'pk_device';

/**
 * Stable id for this browser, sent to /v1/auth/bootstrap so the API can bind
 * the Supabase session to a device (doc 05 §4.4). Only callable where cookies
 * can be written (Server Actions, Route Handlers).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const id = randomUUID();
  try {
    store.set(DEVICE_COOKIE, id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // If called during Server Component render, cookie mutation is disallowed by Next.js.
  }
  return id;
}

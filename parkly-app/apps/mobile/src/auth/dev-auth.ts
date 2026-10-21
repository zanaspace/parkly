import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEV_SESSION_KEY = 'parkly.dev_session';

/**
 * Whether SMS OTP is bypassed for local development and testing. Dev tokens
 * only work against the API's in-memory store (there is no auth.users row
 * behind them), so set EXPO_PUBLIC_DEV_AUTH=off when the API uses a real
 * database and sign in with a Supabase test phone number instead.
 */
export function isDevBypass(): boolean {
  if (process.env.EXPO_PUBLIC_DEV_AUTH === 'off') return false;
  return __DEV__ || process.env.NODE_ENV !== 'production';
}

/** Generates a deterministic valid RFC 4122 v4 UUID for a phone number. */
export function devUserIdForPhone(phone: string): string {
  if (phone === '+2348031234567' || phone === '+2348000000001') {
    return '11111111-1111-4111-8111-111111111111';
  }
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    hash = ((hash << 5) - hash + phone.charCodeAt(i)) | 0;
  }
  const h = Math.abs(hash).toString(16).padStart(8, '0');
  return `${h}-1234-4234-8234-${h}${h.slice(0, 4)}`;
}

/** Creates a mock Supabase session object for local development. */
export function createDevSession(phone: string): Session {
  const userId = devUserIdForPhone(phone);
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: `dev-token:${phone}:${userId}`,
    refresh_token: 'dev-refresh-token',
    expires_in: 86400 * 365,
    expires_at: nowSec + 86400 * 365,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: undefined,
      phone,
      app_metadata: { provider: 'phone' },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Session['user'],
  };
}

let memoryDevSession: Session | null = null;

export async function getStoredDevSession(): Promise<Session | null> {
  if (!isDevBypass()) return null;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(DEV_SESSION_KEY);
        return raw ? (JSON.parse(raw) as Session) : null;
      }
      return memoryDevSession;
    }
    const raw = await SecureStore.getItemAsync(DEV_SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveDevSession(session: Session): Promise<void> {
  memoryDevSession = session;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(session));
      }
      return;
    }
    await SecureStore.setItemAsync(DEV_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors in dev
  }
}

export async function clearDevSession(): Promise<void> {
  memoryDevSession = null;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(DEV_SESSION_KEY);
      }
      return;
    }
    await SecureStore.deleteItemAsync(DEV_SESSION_KEY);
  } catch {
    // Ignore storage errors in dev
  }
}

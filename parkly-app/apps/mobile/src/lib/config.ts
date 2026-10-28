import Constants from 'expo-constants';

/**
 * Public build-time config (EXPO_PUBLIC_* only — these end up in the app
 * bundle, so never put a secret here; see .env.example).
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  /** Shows 5-minute test stays; the API refuses them unless its own switch is on (never in prod). */
  testStays: process.env.EXPO_PUBLIC_TEST_STAYS === 'on',
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey);

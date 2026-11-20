import Constants from 'expo-constants';

/**
 * Public build-time config (EXPO_PUBLIC_* only — these end up in the app
 * bundle, so never put a secret here; see .env.example).
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qbheoilyuvudiefubdco.supabase.co',
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_HrJbKNmjEKpLxVlge_qBGA_kzzvnHF6',
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://parkly-api-six.vercel.app',
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  /** Shows 5-minute test stays; the API refuses them unless its own switch is on (never in prod). */
  testStays: process.env.EXPO_PUBLIC_TEST_STAYS === 'on',
  /** Cloudflare Turnstile (ADR 0019): the public site key and one hostname it allows. */
  turnstileSiteKey: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAFsyOLeaV5XGi7en',
  turnstileOrigin: process.env.EXPO_PUBLIC_TURNSTILE_ORIGIN || 'https://parkly-web-two.vercel.app',
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey);

/** Captcha is on only when both values are set, and must be before Supabase requires it. */
export const captchaEnabled = Boolean(config.turnstileSiteKey && config.turnstileOrigin);

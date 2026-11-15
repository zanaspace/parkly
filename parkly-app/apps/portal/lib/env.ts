/**
 * Public config (safe to expose: URL + publishable key + API URL). Local
 * defaults match `supabase start` and the API dev server.
 */
export function publicEnv() {
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    (typeof window === 'undefined' ? 'public-anon-key-placeholder' : '');
  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.example)');
  }
  const defaultApi =
    process.env.VERCEL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.NODE_ENV === 'production'
      ? 'https://parkly-api-six.vercel.app'
      : 'http://localhost:4000';
  const rawApi = process.env.NEXT_PUBLIC_API_URL;
  const apiUrl = (rawApi && !rawApi.includes('localhost') ? rawApi : defaultApi).replace(/\/$/, '');
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    supabaseKey,
    apiUrl,
  };
}

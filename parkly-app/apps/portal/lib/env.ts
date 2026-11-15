/**
 * Public config (safe to expose: URL + publishable key + API URL). Local
 * defaults match `supabase start` and the API dev server.
 */
export function publicEnv() {
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (typeof window === 'undefined' ? 'public-anon-key-placeholder' : '');
  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.example)');
  }
  const isCloud =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.VERCEL_URL) ||
    Boolean(process.env.NEXT_PUBLIC_VERCEL_URL) ||
    process.env.NODE_ENV === 'production';
  const defaultApi = isCloud ? 'https://parkly-api-six.vercel.app' : 'http://localhost:4000';
  const rawApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  const isLocal =
    !rawApi ||
    rawApi.includes('localhost') ||
    rawApi.includes('127.0.0.1') ||
    rawApi.startsWith('http://0.0.0.0');
  const apiUrl = (isLocal && isCloud ? defaultApi : rawApi || defaultApi).replace(/\/$/, '');
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    supabaseKey,
    apiUrl,
  };
}

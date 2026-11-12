import { securityHeaders } from '@parkly/config/next-security-headers';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// `next dev` only serves its scripts to localhost. To open the app from a phone or
// another computer, list that address here, e.g. DEV_ORIGINS=192.168.1.20 (doc 22 §3).
const devOrigins = (process.env.DEV_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: devOrigins,
  async headers() {
    return securityHeaders({
      isDev,
      captcha: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
      connectSrc: [
        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      ],
      // Lot photos for review load through short-lived signed Storage links.
      imgSrc: [process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'],
    });
  },
};

export default config;

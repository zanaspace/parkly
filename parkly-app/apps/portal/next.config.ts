import { securityHeaders } from '@parkly/config/next-security-headers';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return securityHeaders({
      isDev,
      captcha: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
      connectSrc: [
        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      ],
    });
  },
};

export default config;

import { securityHeaders } from '@parkly/config/next-security-headers';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return securityHeaders({
      isDev,
      connectSrc: [
        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
        // Map style, tiles, fonts and icons (ADR 0014).
        'https://tiles.openfreemap.org',
      ],
      // Approved lot photos are served from the public Supabase Storage bucket.
      imgSrc: [process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'],
    });
  },
};

export default config;

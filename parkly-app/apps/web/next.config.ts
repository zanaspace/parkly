import { securityHeaders } from '@parkly/config/next-security-headers';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return securityHeaders({
      isDev,
      connectSrc: [process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'],
    });
  },
};

export default config;

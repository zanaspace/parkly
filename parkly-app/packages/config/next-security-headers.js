// Security headers for every Next.js app (doc 05 web headers). Used from next.config.ts.
// Next needs inline scripts for hydration; moving to nonce-based CSP is tracked for Sprint 9 hardening.

// Cloudflare Turnstile (ADR 0019) loads its script and runs in an iframe from here.
const TURNSTILE = 'https://challenges.cloudflare.com';

/** @param {{ isDev: boolean, connectSrc?: string[], imgSrc?: string[], captcha?: boolean }} options */
export function securityHeaders({ isDev, connectSrc = [], imgSrc = [], captcha = false }) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}${captcha ? ` ${TURNSTILE}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${imgSrc.map((s) => ` ${s}`).join('')}`,
    "font-src 'self'",
    `connect-src 'self' ${connectSrc.join(' ')}${isDev ? ' ws:' : ''}`.trim(),
    ...(captcha ? [`frame-src ${TURNSTILE}`] : []),
    // MapLibre (ADR 0014) runs its tile parser in a worker created from a blob URL.
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      ],
    },
  ];
}

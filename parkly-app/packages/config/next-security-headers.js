// Security headers for every Next.js app (doc 05 web headers). Used from next.config.ts.
// Next needs inline scripts for hydration; moving to nonce-based CSP is tracked for Sprint 9 hardening.

/** @param {{ isDev: boolean, connectSrc?: string[], imgSrc?: string[] }} options */
export function securityHeaders({ isDev, connectSrc = [], imgSrc = [] }) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${imgSrc.map((s) => ` ${s}`).join('')}`,
    "font-src 'self'",
    `connect-src 'self' ${connectSrc.join(' ')}${isDev ? ' ws:' : ''}`.trim(),
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

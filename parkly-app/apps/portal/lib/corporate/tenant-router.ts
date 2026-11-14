/**
 * Utilities for resolving dedicated corporate subdomains (e.g. zenith.parkly.ng)
 * and custom enterprise CNAME domains.
 */

export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'portal',
  'gov',
  'static',
  'cdn',
  'mail',
  'auth',
]);

/**
 * Extracts the corporate subdomain from an incoming request Host header.
 * E.g.:
 *  "zenith.parkly.ng" -> "zenith"
 *  "kpmg.parkly.ng:3000" -> "kpmg"
 *  "portal.parkly.ng" -> null (reserved)
 *  "parkly.ng" -> null
 *  "localhost:3000" -> null
 */
export function extractCorporateSubdomain(
  hostname: string,
  rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'parkly.ng',
): string | null {
  if (!hostname) return null;
  const host = (hostname.split(':')[0] ?? '').toLowerCase().trim();
  if (!host) return null;

  // Root domain, localhost or IP addresses
  if (
    host === rootDomain ||
    host === `www.${rootDomain}` ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return null;
  }

  // Handle *.parkly.ng subdomains
  if (host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, -(rootDomain.length + 1));
    // If it's a multi-level subdomain or reserved, ignore
    if (sub.includes('.') || RESERVED_SUBDOMAINS.has(sub)) {
      return null;
    }
    return sub;
  }

  // In local development, support <company>.localhost
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    if (!sub.includes('.') && !RESERVED_SUBDOMAINS.has(sub)) {
      return sub;
    }
  }

  return null;
}

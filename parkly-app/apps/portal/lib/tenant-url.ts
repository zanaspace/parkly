/**
 * Resolves the dynamic tenant portal URL for the current environment.
 * - In Vercel / Staging: https://parkly-portal.vercel.app/corp/[slug]
 *   (Always uses the clean, public canonical URL without ephemeral preview hashes)
 * - In Local development: http://localhost:3001/corp/[slug]
 * - When custom wildcard domain is live: https://[slug].parkly.ng
 */
export type DynamicTenantUrlInfo = {
  activeUrl: string;
  displayUrl: string;
  productionUrl: string;
  isStagingOrDev: boolean;
};

const CANONICAL_PUBLIC_PORTAL_HOST = 'parkly-portal.vercel.app';

export function getTenantUrl(slug: string, hostOrOrigin?: string): DynamicTenantUrlInfo {
  const cleanSlug = slug.toLowerCase().trim() || 'company';
  const productionUrl = `https://${cleanSlug}.parkly.ng`;

  let currentOrigin = '';

  if (typeof window !== 'undefined' && window.location?.origin) {
    currentOrigin = window.location.origin;
  } else if (hostOrOrigin) {
    currentOrigin = hostOrOrigin.startsWith('http') ? hostOrOrigin : `https://${hostOrOrigin}`;
  } else if (process.env.NEXT_PUBLIC_PORTAL_URL) {
    currentOrigin = process.env.NEXT_PUBLIC_PORTAL_URL;
  }

  currentOrigin = currentOrigin.replace(/\/$/, '');

  // 1. If running under official domain (parkly.ng)
  if (currentOrigin.includes('parkly.ng') && !currentOrigin.includes('vercel.app')) {
    return {
      activeUrl: `https://portal.parkly.ng/corp/${cleanSlug}`,
      displayUrl: `portal.parkly.ng/corp/${cleanSlug}`,
      productionUrl: `https://portal.parkly.ng/corp/${cleanSlug}`,
      isStagingOrDev: false,
    };
  }

  // 2. If running locally (localhost / 127.0.0.1)
  if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
    const portMatch = currentOrigin.match(/:(\d+)$/);
    const port = portMatch ? portMatch[1] : '3001';
    const localHost = `http://localhost:${port}`;
    return {
      activeUrl: `${localHost}/corp/${cleanSlug}`,
      displayUrl: `localhost:${port}/corp/${cleanSlug}`,
      productionUrl,
      isStagingOrDev: true,
    };
  }

  // 3. In Vercel or cloud environments:
  // Always resolve to the clean, public, canonical production URL
  // (e.g. parkly-portal.vercel.app/corp/[slug]) so that users never see
  // ephemeral preview hashes (-526i0iden-...) and never get gated by Vercel SSO.
  const activeUrl = `https://${CANONICAL_PUBLIC_PORTAL_HOST}/corp/${cleanSlug}`;
  const displayUrl = `${CANONICAL_PUBLIC_PORTAL_HOST}/corp/${cleanSlug}`;

  return {
    activeUrl,
    displayUrl,
    productionUrl,
    isStagingOrDev: true,
  };
}

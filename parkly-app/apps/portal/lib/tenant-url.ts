/**
 * Resolves the dynamic tenant portal URL for the current environment.
 * - When running on Vercel: https://parkly-portal.vercel.app/corp/[slug]
 * - When running locally: http://localhost:3001/corp/[slug] (or detected port)
 * - When custom wildcard domain is live: https://[slug].parkly.ng
 */
export type DynamicTenantUrlInfo = {
  activeUrl: string;
  displayUrl: string;
  productionUrl: string;
  isStagingOrDev: boolean;
};

export function getTenantUrl(slug: string, hostOrOrigin?: string): DynamicTenantUrlInfo {
  const cleanSlug = slug.toLowerCase().trim() || 'company';
  const productionUrl = `https://${cleanSlug}.parkly.ng`;

  let origin: string;

  if (typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  } else if (hostOrOrigin) {
    origin = hostOrOrigin.startsWith('http') ? hostOrOrigin : `https://${hostOrOrigin}`;
    origin = origin.replace(/\/$/, '');
  } else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    origin = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  } else if (process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL}`;
  } else {
    origin =
      process.env.NODE_ENV === 'production'
        ? 'https://parkly-portal.vercel.app'
        : 'http://localhost:3001';
  }

  // If already running under an active parkly.ng apex domain
  const isParklyApex = origin.includes('parkly.ng') && !origin.includes('vercel.app');

  if (isParklyApex) {
    return {
      activeUrl: `https://${cleanSlug}.parkly.ng`,
      displayUrl: `${cleanSlug}.parkly.ng`,
      productionUrl,
      isStagingOrDev: false,
    };
  }

  // In Local dev or Vercel preview (e.g. parkly-portal.vercel.app or localhost:3001)
  const activeUrl = `${origin}/corp/${cleanSlug}`;
  const displayUrl = `${origin.replace(/^https?:\/\//, '')}/corp/${cleanSlug}`;

  return {
    activeUrl,
    displayUrl,
    productionUrl,
    isStagingOrDev: true,
  };
}

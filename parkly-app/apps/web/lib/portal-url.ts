/**
 * Dynamic resolution of Portal and Onboarding URLs for apps/web.
 * Resolves seamlessly between local dev (localhost:3001),
 * Vercel staging (parkly-portal.vercel.app), and production (portal.parkly.ng).
 */
export type PortalUrls = {
  portalBaseUrl: string;
  operatorSignUp: string;
  operatorSignIn: string;
  corporateOnboarding: string;
  corporateExplore: string;
};

export function getPortalUrls(hostOrOrigin?: string): PortalUrls {
  let portalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_URL;

  if (!portalBaseUrl) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        portalBaseUrl = origin.replace(/:[0-9]+/, ':3001');
      } else if (origin.includes('vercel.app')) {
        portalBaseUrl = 'https://parkly-portal.vercel.app';
      } else {
        portalBaseUrl = 'https://portal.parkly.ng';
      }
    } else if (hostOrOrigin) {
      if (hostOrOrigin.includes('localhost') || hostOrOrigin.includes('127.0.0.1')) {
        portalBaseUrl = 'http://localhost:3001';
      } else if (hostOrOrigin.includes('vercel.app')) {
        portalBaseUrl = 'https://parkly-portal.vercel.app';
      } else {
        portalBaseUrl = 'https://portal.parkly.ng';
      }
    } else {
      portalBaseUrl =
        process.env.NODE_ENV === 'production'
          ? 'https://parkly-portal.vercel.app'
          : 'http://localhost:3001';
    }
  }

  const cleanBase = portalBaseUrl.replace(/\/$/, '');

  return {
    portalBaseUrl: cleanBase,
    operatorSignUp: `${cleanBase}/sign-up`,
    operatorSignIn: `${cleanBase}/sign-in`,
    corporateOnboarding: `${cleanBase}/corporate/onboarding`,
    corporateExplore: `${cleanBase}/corp/zenith`,
  };
}

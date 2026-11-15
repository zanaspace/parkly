import type { PortalUrls } from '../../lib/portal-url';

export type AudienceTier = {
  id: 'drivers' | 'operators' | 'corporate';
  badge: string;
  badgeTone: 'default' | 'live' | 'verified';
  title: string;
  subtitle: string;
  features: string[];
  primaryCta: {
    label: string;
    href: (urls: PortalUrls) => string;
    isExternal: boolean;
  };
  secondaryCta?: {
    label: string;
    href: (urls: PortalUrls) => string;
    isExternal: boolean;
  };
  iconName: 'car' | 'building' | 'team';
};

export const AUDIENCE_TIERS: AudienceTier[] = [
  {
    id: 'drivers',
    badge: 'Drivers & Commuters',
    badgeTone: 'default',
    title: 'Find & Book Parking',
    subtitle: 'Safe, verified spaces across Lagos with upfront pricing and zero gate touts.',
    iconName: 'car',
    features: [
      '100% LASPA-verified secure lots',
      'Pay full price upfront — no hidden gate surcharges',
      'Instant digital QR ticket directly on your phone',
      'Monthly pass subscriptions for daily office commuters',
    ],
    primaryCta: {
      label: 'Find Parking Now',
      href: () => '/search',
      isExternal: false,
    },
    secondaryCta: {
      label: 'View Monthly Passes',
      href: () => '/passes',
      isExternal: false,
    },
  },
  {
    id: 'operators',
    badge: 'Car Park Operators',
    badgeTone: 'live',
    title: 'Monetize & Automate',
    subtitle:
      'Turn your off-street lot or commercial facility into a high-occupancy revenue engine.',
    iconName: 'building',
    features: [
      'Daily automated cashless settlement to your bank',
      'Free offline Attendant PWA for fast gate check-in',
      'Real-time occupancy dashboard & revenue audit reports',
      'LASPA regulatory compliance & digitized enforcement',
    ],
    primaryCta: {
      label: 'Onboard as Operator',
      href: (urls) => urls.operatorSignUp,
      isExternal: true,
    },
    secondaryCta: {
      label: 'Operator Sign In',
      href: (urls) => urls.operatorSignIn,
      isExternal: true,
    },
  },
  {
    id: 'corporate',
    badge: 'Enterprise Mobility',
    badgeTone: 'verified',
    title: 'Corporate Transit Portals',
    subtitle:
      'Subsidize employee parking, manage fleet cost centers, and receive one monthly bill.',
    iconName: 'team',
    features: [
      'Sovereign branded portal (e.g. company.parkly.ng)',
      'Automated domain SSO & instant employee pass grants',
      'Departmental cost center budgets (Fleet, Sales, Execs)',
      'Consolidated Net-30 monthly invoicing & VAT receipts',
    ],
    primaryCta: {
      label: 'Setup Corporate Portal',
      href: (urls) => urls.corporateOnboarding,
      isExternal: true,
    },
    secondaryCta: {
      label: 'Preview Live Portal',
      href: (urls) => urls.corporateExplore,
      isExternal: true,
    },
  },
];

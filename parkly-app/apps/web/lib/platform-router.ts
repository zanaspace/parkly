import type { Me } from '@parkly/contracts';

export type PlatformApp = 'driver' | 'operator' | 'corporate' | 'admin';

export type WorkspaceItem = {
  id: string;
  title: string;
  subtitle: string;
  type: PlatformApp;
  url: string;
  badge: string;
  badgeTone: 'default' | 'live' | 'verified';
};

/**
 * Resolves destination URLs across Localhost, Vercel Staging, and Production DNS.
 */
export function resolveAppUrl(
  app: PlatformApp,
  options?: { slug?: string; path?: string; hostOrOrigin?: string },
): string {
  const path = options?.path
    ? options.path.startsWith('/')
      ? options.path
      : `/${options.path}`
    : '';
  const slug = options?.slug?.toLowerCase().trim() || 'company';

  let origin = '';
  if (typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  } else if (options?.hostOrOrigin) {
    origin = options.hostOrOrigin.startsWith('http')
      ? options.hostOrOrigin
      : `https://${options.hostOrOrigin}`;
  } else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    origin = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  } else if (process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL}`;
  }

  const isLocal =
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    process.env.NODE_ENV !== 'production';
  const isVercel = origin.includes('vercel.app');

  // 1. Localhost multi-port dev architecture
  if (isLocal) {
    switch (app) {
      case 'driver':
        return `http://localhost:3000${path || '/bookings'}`;
      case 'operator':
        return `http://localhost:3001${path}`;
      case 'corporate':
        return `http://localhost:3001/corp/${slug}${path}`;
      case 'admin':
        return `http://localhost:3002${path}`;
    }
  }

  // 2. Vercel Staging multi-app architecture
  if (isVercel) {
    switch (app) {
      case 'driver':
        return `https://parkly-web-two.vercel.app${path || '/bookings'}`;
      case 'operator':
        return `https://parkly-portal.vercel.app${path}`;
      case 'corporate':
        return `https://parkly-portal.vercel.app/corp/${slug}${path}`;
      case 'admin':
        return `https://parkly-admin.vercel.app${path}`;
    }
  }

  // 3. Production Apex & Subdomain DNS architecture
  switch (app) {
    case 'driver':
      return `https://parkly.ng${path || '/bookings'}`;
    case 'operator':
      return `https://portal.parkly.ng${path}`;
    case 'corporate':
      return `https://portal.parkly.ng/corp/${slug}${path}`;
    case 'admin':
      return `https://admin.parkly.ng${path}`;
  }
}

/**
 * Inspects a user's verified roles and constructs their accessible workspaces.
 */
export function resolveWorkspaces(
  user: Me,
  options?: { hostOrOrigin?: string; corporateTenants?: Array<{ slug: string; name: string }> },
): WorkspaceItem[] {
  const workspaces: WorkspaceItem[] = [];
  const roles = user.roles.map((r) => r.role);

  // 1. Driver Account (Default personal driver capabilities)
  if (roles.includes('DRIVER')) {
    workspaces.push({
      id: 'driver',
      title: 'Personal Driver Account',
      subtitle: 'Find parking, view tickets, and manage monthly passes.',
      type: 'driver',
      url: resolveAppUrl('driver', { path: '/bookings', hostOrOrigin: options?.hostOrOrigin }),
      badge: 'Driver',
      badgeTone: 'default',
    });
  }

  // 2. Car Park Operator / Lot Owner
  const hasOperatorRole = roles.some((r) =>
    ['OPERATOR_OWNER', 'OPERATOR_MANAGER', 'OPERATOR_ATTENDANT'].includes(r),
  );
  if (hasOperatorRole) {
    workspaces.push({
      id: 'operator',
      title: 'Car Park Operator Portal',
      subtitle: 'Facility revenue, live occupancy, and Attendant PWA gates.',
      type: 'operator',
      url: resolveAppUrl('operator', { hostOrOrigin: options?.hostOrOrigin }),
      badge: 'Operator',
      badgeTone: 'live',
    });
  }

  // 3. Corporate Tenancies
  const corpTenants =
    user.corporateTenants && user.corporateTenants.length > 0
      ? user.corporateTenants
      : (options?.corporateTenants ?? []);
  for (const tenant of corpTenants) {
    workspaces.push({
      id: `corp-${tenant.slug}`,
      title: `${tenant.name} Corporate Mobility`,
      subtitle: 'Employee pass subsidies, cost centers, and fleet billing.',
      type: 'corporate',
      url: resolveAppUrl('corporate', { slug: tenant.slug, hostOrOrigin: options?.hostOrOrigin }),
      badge: 'Enterprise',
      badgeTone: 'verified',
    });
  }

  // 4. Back-Office Administrative Staff
  const hasAdminRole = roles.some((r) =>
    ['SUPER_ADMIN', 'ADMIN_SUPPORT', 'ADMIN_OPS', 'ADMIN_FINANCE', 'ADMIN_COMPLIANCE'].includes(r),
  );
  if (hasAdminRole) {
    workspaces.push({
      id: 'admin',
      title: 'Parkly Staff Admin',
      subtitle: 'Platform operations, reconciliation, and audit console.',
      type: 'admin',
      url: resolveAppUrl('admin', { hostOrOrigin: options?.hostOrOrigin }),
      badge: 'Back-Office',
      badgeTone: 'verified',
    });
  }

  return workspaces;
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuditIcon, DashboardIcon, KybIcon, LotsIcon, TicketIcon } from './icons';

export function AdminNav({
  canReadAudit,
  canReadBookings,
}: {
  canReadAudit: boolean;
  canReadBookings: boolean;
}) {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard', icon: DashboardIcon, exact: true },
    { href: '/kyb', label: 'KYB Review', icon: KybIcon, exact: false },
    { href: '/lots', label: 'Lots & Permits', icon: LotsIcon, exact: false },
    ...(canReadBookings
      ? [{ href: '/bookings', label: 'Bookings', icon: TicketIcon, exact: false }]
      : []),
    ...(canReadAudit
      ? [{ href: '/audit-logs', label: 'Audit Logs', icon: AuditIcon, exact: false }]
      : []),
  ];

  return (
    <nav className="pk-nav" aria-label="Admin Navigation">
      {links.map((link) => {
        const isActive = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`pk-nav-link ${isActive ? 'pk-nav-link--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={17} />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

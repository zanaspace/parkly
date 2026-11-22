'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CorporateNavTabs({
  slug,
  primaryColor = '#0284c7',
}: {
  slug: string;
  primaryColor?: string;
}) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Overview', href: `/corp/${slug}`, exact: true },
    { label: 'Bookings & Sessions', href: `/corp/${slug}/bookings`, exact: false },
    { label: 'Finance & VAT', href: `/corp/${slug}/finance`, exact: false },
    { label: 'Settings & Roster', href: `/corp/${slug}/settings`, exact: false },
  ];

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        maxWidth: '1200px',
        margin: '0 auto',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
      aria-label="Corporate navigation tabs"
    >
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href || pathname === `${tab.href}/`
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: isActive ? 600 : 500,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              backgroundColor: isActive ? primaryColor : 'var(--pk-color-bg-surface)',
              color: isActive ? '#ffffff' : 'var(--pk-color-text-secondary)',
              border: isActive
                ? `1px solid ${primaryColor}`
                : '1px solid var(--pk-color-border-subtle)',
              boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

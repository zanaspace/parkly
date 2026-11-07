import Link from 'next/link';

const TABS = [
  { key: 'overview', href: '/finance', label: 'Revenue & reconciliation' },
  { key: 'rates', href: '/finance/rates', label: 'Commission rates' },
] as const;

/** Sections of the finance area, so each has its own page instead of one long scroll. */
export function FinanceTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Finance sections" className="pk-tab-nav pk-finance-tabs">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`pk-tab-item${t.key === active ? ' pk-tab-item--active' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

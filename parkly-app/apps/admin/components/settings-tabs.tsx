import Link from 'next/link';

const TABS = [
  { key: 'settings', href: '/settings', label: 'Settings' },
  { key: 'flags', href: '/settings/flags', label: 'Feature flags' },
] as const;

/** The two parts of platform configuration, each on its own page. */
export function SettingsTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Platform sections" className="pk-tab-nav">
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

import { Text } from '@parkly/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BuildingIcon,
  CarIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  TeamIcon,
} from '../../../components/icons';
import { resolveWorkspaces, type WorkspaceItem } from '../../../lib/platform-router';
import { requireDriver } from '../../../lib/session';

export const metadata: Metadata = { title: 'Select Workspace · Parkly' };

export default async function ChooseWorkspacePage() {
  const driver = await requireDriver('/auth/choose-workspace');
  const user = driver.me;

  if (!user) {
    redirect('/sign-in');
  }

  const workspaces = resolveWorkspaces(user);

  // If user only belongs to one workspace, take them there directly
  const firstWs = workspaces[0];
  if (workspaces.length === 1 && firstWs) {
    redirect(firstWs.url);
  }

  const getWorkspaceIcon = (type: WorkspaceItem['type']) => {
    switch (type) {
      case 'driver':
        return <CarIcon size={22} />;
      case 'operator':
        return <BuildingIcon size={22} />;
      case 'corporate':
        return <TeamIcon size={22} />;
      case 'admin':
        return <ShieldCheckIcon size={22} />;
    }
  };

  return (
    <main className="pk-page pk-stack" style={{ marginBlock: '3rem', maxWidth: '38rem' }}>
      <div className="pk-card pk-stack" style={{ padding: '2.5rem 2rem', borderRadius: '16px' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <span className="pk-badge pk-badge--verified" style={{ marginBottom: '0.5rem' }}>
            Unified Identity
          </span>
          <Text variant="heading-xl" as="h1" style={{ margin: '0.25rem 0' }}>
            Choose Workspace
          </Text>
          <Text tone="secondary">
            Your Parkly account has access to multiple portals. Where would you like to go today?
          </Text>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {workspaces.map((ws) => (
            <a
              key={ws.id}
              href={ws.url}
              className="pk-card"
              style={{
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--pk-color-border-default)',
                background: 'var(--pk-color-bg-surface)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'var(--pk-color-teal-50, #EEF8F6)',
                    color: 'var(--pk-color-teal-700, #0F5A53)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {getWorkspaceIcon(ws.type)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: 'var(--pk-color-text-primary)',
                      }}
                    >
                      {ws.title}
                    </span>
                    <span
                      className={`pk-badge ${
                        ws.badgeTone === 'live'
                          ? 'pk-badge--live'
                          : ws.badgeTone === 'verified'
                            ? 'pk-badge--verified'
                            : 'pk-badge--brand-subtle'
                      }`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {ws.badge}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.825rem',
                      color: 'var(--pk-color-text-secondary)',
                      display: 'block',
                      marginTop: '0.15rem',
                    }}
                  >
                    {ws.subtitle}
                  </span>
                </div>
              </div>

              <div
                style={{
                  color: 'var(--pk-color-teal-600, #137066)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronRightIcon size={20} />
              </div>
            </a>
          ))}
        </div>

        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--pk-color-border-default)',
            textAlign: 'center',
          }}
        >
          <Link
            href="/"
            className="pk-link"
            style={{ fontSize: '0.85rem', textDecoration: 'none' }}
          >
            ← Return to Driver Home
          </Link>
        </div>
      </div>
    </main>
  );
}

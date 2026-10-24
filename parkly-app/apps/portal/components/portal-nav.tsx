'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BuildingIcon,
  CloseIcon,
  DashboardIcon,
  GateIcon,
  LogOutIcon,
  LogoMarkIcon,
  LotsIcon,
  MenuIcon,
  PlusIcon,
  ShieldCheckIcon,
  TeamIcon,
} from './icons';
import { signOut } from '../lib/auth/actions';

export interface UserNavInfo {
  name: string;
  role: string;
  email?: string;
}

export function PortalNav({
  isOwner,
  user,
}: {
  isOwner: boolean;
  user?: UserNavInfo;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Handle ESC key and lock body scroll when drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  const links = [
    { href: '/', label: 'Dashboard', shortLabel: 'Dashboard', icon: DashboardIcon, exact: true, category: 'workspaces' },
    { href: '/lots', label: 'Lots & Parking', shortLabel: 'Lots', icon: LotsIcon, exact: false, category: 'workspaces' },
    { href: '/attend', label: 'Gate App', shortLabel: 'Gate App', icon: GateIcon, exact: false, category: 'workspaces' },
    { href: '/team', label: 'Staff & Attendants', shortLabel: 'Team', icon: TeamIcon, exact: false, category: 'management' },
    { href: '/kyb', label: 'Verification (KYB)', shortLabel: 'KYB', icon: ShieldCheckIcon, exact: false, category: 'management' },
    ...(isOwner
      ? [{ href: '/business', label: 'Business Profile', shortLabel: 'Business', icon: BuildingIcon, exact: false, category: 'management' }]
      : []),
  ];

  const isMoreActive =
    pathname.startsWith('/team') ||
    pathname.startsWith('/kyb') ||
    pathname.startsWith('/business');

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'OP';
  const mobileNav = (
    <>
      {/* 3. Mobile Fixed Footer Navigation Toolbar */}
      <nav className="pk-bottom-bar" aria-label="Mobile Navigation Toolbar">
        <Link
          href="/"
          className={`pk-bottom-tab ${pathname === '/' ? 'pk-bottom-tab--active' : ''}`}
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          <DashboardIcon size={20} />
          <span>Dashboard</span>
        </Link>

        <Link
          href="/lots"
          className={`pk-bottom-tab ${pathname.startsWith('/lots') ? 'pk-bottom-tab--active' : ''}`}
          aria-current={pathname.startsWith('/lots') ? 'page' : undefined}
        >
          <LotsIcon size={20} />
          <span>Lots</span>
        </Link>

        <Link
          href="/attend"
          className={`pk-bottom-tab ${pathname.startsWith('/attend') ? 'pk-bottom-tab--active' : ''}`}
          aria-current={pathname.startsWith('/attend') ? 'page' : undefined}
        >
          <GateIcon size={20} />
          <span>Gate App</span>
        </Link>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`pk-bottom-tab ${drawerOpen || isMoreActive ? 'pk-bottom-tab--active' : ''}`}
          aria-label="More Navigation Options"
          aria-expanded={drawerOpen}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <MenuIcon size={20} />
            {isMoreActive && <span className="pk-bottom-tab-dot" aria-hidden="true" />}
          </div>
          <span>More</span>
        </button>
      </nav>

      {/* 4. Collapsible Mobile Slide-Out Drawer / Sidebar */}
      {drawerOpen && (
        <div className="pk-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div
            className="pk-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Operator Navigation Menu"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="pk-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <LogoMarkIcon size={26} />
                <span className="pk-drawer-title">Parkly Ops</span>
              </div>
              <button
                type="button"
                className="pk-drawer-close-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close Navigation Menu"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            {/* User Identity Card */}
            {user && (
              <div className="pk-drawer-user-card">
                <div className="pk-drawer-avatar">{initials}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong className="pk-drawer-user-name">{user.name}</strong>
                    <span className="pk-badge pk-badge--verified" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                      {user.role}
                    </span>
                  </div>
                  {user.email && <div className="pk-drawer-user-email">{user.email}</div>}
                </div>
              </div>
            )}

            {/* Scrollable Navigation Body */}
            <div className="pk-drawer-body">
              <div className="pk-drawer-section">
                <div className="pk-drawer-section-label">MAIN WORKSPACES</div>
                <div className="pk-drawer-links">
                  {links
                    .filter((l) => l.category === 'workspaces')
                    .map((link) => {
                      const isActive = link.exact
                        ? pathname === link.href
                        : pathname === link.href || pathname.startsWith(`${link.href}/`);
                      const Icon = link.icon;
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`pk-drawer-link ${isActive ? 'pk-drawer-link--active' : ''}`}
                        >
                          <span className="pk-drawer-link-icon">
                            <Icon size={18} />
                          </span>
                          <span className="pk-drawer-link-text">{link.label}</span>
                        </Link>
                      );
                    })}
                </div>
              </div>

              <div className="pk-drawer-section">
                <div className="pk-drawer-section-label">MANAGEMENT & COMPLIANCE</div>
                <div className="pk-drawer-links">
                  {links
                    .filter((l) => l.category === 'management')
                    .map((link) => {
                      const isActive = link.exact
                        ? pathname === link.href
                        : pathname === link.href || pathname.startsWith(`${link.href}/`);
                      const Icon = link.icon;
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`pk-drawer-link ${isActive ? 'pk-drawer-link--active' : ''}`}
                        >
                          <span className="pk-drawer-link-icon">
                            <Icon size={18} />
                          </span>
                          <span className="pk-drawer-link-text">{link.label}</span>
                        </Link>
                      );
                    })}
                </div>
              </div>

              <div className="pk-drawer-section">
                <div className="pk-drawer-section-label">QUICK ACTIONS</div>
                <div className="pk-drawer-links">
                  <Link
                    href="/lots/new"
                    className={`pk-drawer-link ${pathname === '/lots/new' ? 'pk-drawer-link--active' : ''}`}
                  >
                    <span className="pk-drawer-link-icon">
                      <PlusIcon size={18} />
                    </span>
                    <span className="pk-drawer-link-text">Add New Car Park</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="pk-drawer-footer">
              <form action={signOut} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button type="submit" name="scope" value="device" className="pk-drawer-signout-btn">
                  <LogOutIcon size={16} />
                  <span>Sign out this device</span>
                </button>
                <button type="submit" name="scope" value="all" className="pk-drawer-signout-subtle-btn">
                  Sign out everywhere
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* 1. Desktop Horizontal Navigation */}
      <nav className="pk-nav pk-nav--desktop" aria-label="Operator Portal Navigation">
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
              <Icon size={16} />
              <span>{link.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      {/* Teleport bottom bar and drawer to document.body so it is NEVER trapped in sticky header */}
      {mounted && typeof document !== 'undefined' ? createPortal(mobileNav, document.body) : null}
    </>
  );
}

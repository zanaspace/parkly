'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDownIcon,
  LogOutIcon,
  LogoMarkIcon,
  SearchIcon,
  TicketIcon,
  UserIcon,
} from './icons';
import { signOut } from '../lib/auth/actions';

export interface WebNavProps {
  signedIn: boolean;
  userEmail?: string;
}

export function WebNav({ signedIn, userEmail }: WebNavProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!userDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userDropdownOpen]);

  // Close dropdown on navigation
  useEffect(() => {
    setUserDropdownOpen(false);
  }, [pathname]);

  const navItems = [
    { href: '/search', label: 'Find parking', icon: SearchIcon, active: pathname === '/search' || pathname === '/' },
    { href: '/bookings', label: 'My bookings', icon: TicketIcon, active: pathname.startsWith('/bookings') },
  ];

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : 'DR';

  const mobileNav = (
    <nav className="pk-bottom-bar" aria-label="Mobile Navigation">
      <Link
        href="/search"
        className={`pk-bottom-tab ${pathname === '/search' || pathname === '/' ? 'pk-bottom-tab--active' : ''}`}
      >
        <span className="pk-bottom-tab-icon">
          <SearchIcon size={20} />
        </span>
        <span className="pk-bottom-tab-label">Find Parking</span>
      </Link>

      <Link
        href="/bookings"
        className={`pk-bottom-tab ${pathname.startsWith('/bookings') ? 'pk-bottom-tab--active' : ''}`}
      >
        <span className="pk-bottom-tab-icon">
          <TicketIcon size={20} />
        </span>
        <span className="pk-bottom-tab-label">My Bookings</span>
      </Link>

      {signedIn ? (
        <form action={signOut} style={{ flex: 1, display: 'flex' }}>
          <button
            type="submit"
            className="pk-bottom-tab"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="pk-bottom-tab-icon">
              <LogOutIcon size={20} />
            </span>
            <span className="pk-bottom-tab-label">Sign out</span>
          </button>
        </form>
      ) : (
        <Link
          href="/sign-in"
          className={`pk-bottom-tab ${pathname.startsWith('/sign-in') ? 'pk-bottom-tab--active' : ''}`}
        >
          <span className="pk-bottom-tab-icon">
            <UserIcon size={20} />
          </span>
          <span className="pk-bottom-tab-label">Sign in</span>
        </Link>
      )}
    </nav>
  );

  return (
    <>
      <header className="pk-topbar">
        <div className="pk-topbar-main">
          <Link className="pk-brand" href="/" aria-label="Parkly Home">
            <LogoMarkIcon size={28} />
            <span className="pk-brand-name">Parkly</span>
            <span className="pk-badge pk-badge--brand-subtle pk-brand-badge">Drivers</span>
          </Link>

          <nav className="pk-topbar-nav" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  className={`pk-nav-pill ${item.active ? 'pk-nav-pill--active' : ''}`}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pk-topbar-actions">
          {signedIn ? (
            <div className="pk-user-menu-container" ref={dropdownRef}>
              <button
                type="button"
                className={`pk-user-pill ${userDropdownOpen ? 'pk-user-pill--active' : ''}`}
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                aria-expanded={userDropdownOpen}
                aria-haspopup="menu"
                aria-label="User account menu"
              >
                <span className="pk-user-avatar">{initials}</span>
                <div className="pk-user-pill-info">
                  <span className="pk-user-pill-name">{userEmail ?? 'Driver'}</span>
                  <span className="pk-badge pk-badge--verified pk-user-pill-role">Driver</span>
                </div>
                <ChevronDownIcon
                  size={14}
                  className={`pk-user-pill-chevron ${userDropdownOpen ? 'pk-user-pill-chevron--open' : ''}`}
                />
              </button>

              {userDropdownOpen && (
                <div className="pk-user-dropdown" role="menu" aria-orientation="vertical">
                  <div className="pk-user-dropdown-header">
                    <span className="pk-user-dropdown-name">{userEmail ?? 'Driver Account'}</span>
                    <span className="pk-user-dropdown-sub">Verified Driver</span>
                  </div>
                  <div className="pk-user-dropdown-divider" />
                  <Link
                    href="/bookings"
                    className="pk-user-dropdown-item"
                    role="menuitem"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <TicketIcon size={16} />
                    <span>My Bookings</span>
                  </Link>
                  <div className="pk-user-dropdown-divider" />
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="pk-user-dropdown-item pk-user-dropdown-item--danger"
                      role="menuitem"
                    >
                      <LogOutIcon size={16} />
                      <span>Sign out</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <Link className="pk-btn-signin" href="/sign-in">
              <UserIcon size={16} />
              <span>Sign in</span>
            </Link>
          )}
        </div>
      </header>

      {mounted && typeof document !== 'undefined'
        ? createPortal(mobileNav, document.body)
        : null}
    </>
  );
}

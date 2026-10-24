'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, LogOutIcon } from './icons';
import { signOut } from '../lib/auth/actions';

export interface UserMenuProps {
  user: {
    name: string;
    role: string;
    email?: string;
  };
}

export function UserAccountMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'OP';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="pk-user-menu-container" ref={containerRef}>
      <button
        type="button"
        className={`pk-user-pill ${open ? 'pk-user-pill--active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="User account menu"
      >
        <span className="pk-user-avatar">{initials}</span>
        <div className="pk-user-pill-info">
          <span className="pk-user-pill-name">{user.name}</span>
          <span className="pk-badge pk-badge--verified pk-user-pill-role">{user.role}</span>
        </div>
        <ChevronDownIcon
          size={14}
          className={`pk-user-pill-chevron ${open ? 'pk-user-pill-chevron--open' : ''}`}
        />
      </button>

      {open && (
        <div className="pk-user-dropdown" role="menu" aria-orientation="vertical">
          <div className="pk-user-dropdown-header">
            <span className="pk-user-avatar pk-user-avatar--lg">{initials}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <strong className="pk-user-dropdown-name">{user.name}</strong>
                <span className="pk-badge pk-badge--verified" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                  {user.role}
                </span>
              </div>
              {user.email && <div className="pk-user-dropdown-email">{user.email}</div>}
            </div>
          </div>

          <div className="pk-user-dropdown-divider" />

          <form action={signOut} className="pk-user-dropdown-form">
            <button
              type="submit"
              name="scope"
              value="device"
              className="pk-user-dropdown-btn pk-user-dropdown-btn--danger"
            >
              <LogOutIcon size={16} />
              <span>Sign out this device</span>
            </button>
            <button
              type="submit"
              name="scope"
              value="all"
              className="pk-user-dropdown-btn-subtle"
            >
              Sign out everywhere
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

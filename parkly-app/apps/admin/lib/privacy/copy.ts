import type { DataRequestItem } from '@parkly/contracts';

// Mirrors the API's `dsar:read` rule; the API enforces it.
const READERS = new Set(['ADMIN_COMPLIANCE', 'SUPER_ADMIN']);
export const canReadDataRequests = (roles: { role: string }[]) =>
  roles.some((r) => READERS.has(r.role));

export const TYPE: Record<DataRequestItem['type'], string> = {
  ACCESS: 'Copy of their data',
  CORRECTION: 'Correction',
  DELETION: 'Close account',
  PORTABILITY: 'Portability',
  OBJECTION: 'Objection',
};

export const STATUS: Record<DataRequestItem['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Done',
  REJECTED: 'Refused',
  CANCELLED: 'Cancelled by them',
};

/** What the account's state says about a closure, in words for staff. */
export function accountNote(item: Pick<DataRequestItem, 'type' | 'status' | 'userStatus'>): string {
  if (item.type !== 'DELETION') return '';
  if (item.userStatus === 'DELETED') return 'Erased';
  if (item.status === 'OPEN' || item.status === 'IN_PROGRESS')
    return 'Waiting out the 30 days; erased after';
  return '';
}

export const TABS = [
  { key: 'open', label: 'Open', status: 'OPEN' },
  { key: 'done', label: 'Done', status: 'COMPLETED' },
  { key: 'cancelled', label: 'Cancelled', status: 'CANCELLED' },
  { key: 'all', label: 'All', status: undefined },
] as const;

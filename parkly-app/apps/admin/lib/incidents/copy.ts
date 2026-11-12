import type { IncidentView } from '@parkly/contracts';

// Mirrors the API's `incident:manage` rule; the API enforces it.
const MANAGERS = new Set(['ADMIN_SUPPORT', 'ADMIN_OPS', 'SUPER_ADMIN']);
export const canManageIncidents = (roles: { role: string }[]) =>
  roles.some((r) => MANAGERS.has(r.role));

export const CATEGORY: Record<IncidentView['category'], string> = {
  SAFETY: 'Safety',
  DAMAGE: 'Damage',
  THEFT: 'Theft',
  OVERCHARGE: 'Overcharge',
  TOUT: 'Tout',
  ACCESS_DENIED: 'Access denied',
  LOT_FULL: 'Car park full',
  APP_ISSUE: 'App issue',
  OTHER: 'Other',
};

export const STATUS: Record<IncidentView['status'], string> = {
  OPEN: 'Open',
  TRIAGED: 'Triaged',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** What the form offers, worst first, with the PRD's S-level. */
export const SEVERITY_OPTIONS = [
  { value: 'CRITICAL', label: 'S1 · Critical (pages on-call)' },
  { value: 'HIGH', label: 'S2 · High (respond in 1 hour)' },
  { value: 'MEDIUM', label: 'S3 · Medium (respond in 8 hours)' },
  { value: 'LOW', label: 'S4 · Low (respond in 48 hours)' },
] as const;

/** The steps open to an incident in this status (doc 02 §3.6). */
export function nextActions(
  status: IncidentView['status'],
): ('TRIAGE' | 'RESOLVE' | 'CLOSE' | 'REOPEN')[] {
  switch (status) {
    case 'OPEN':
      return ['TRIAGE'];
    case 'TRIAGED':
      return ['RESOLVE'];
    case 'RESOLVED':
      return ['CLOSE', 'REOPEN'];
    default:
      return [];
  }
}

/** Badge class: red for the worst or overdue, amber while open, green when finished. */
export function incidentTone(i: Pick<IncidentView, 'status' | 'severity' | 'overdue'>): string {
  if (i.status === 'RESOLVED' || i.status === 'CLOSED') return 'pk-badge--approved';
  if (i.overdue || i.severity === 'CRITICAL') return 'pk-badge--rejected';
  return 'pk-badge--submitted';
}

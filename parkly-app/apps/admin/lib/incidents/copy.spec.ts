import { describe, expect, it } from 'vitest';
import { canManageIncidents, incidentTone, nextActions } from './copy';

describe('incident copy', () => {
  it('shows incidents to support, ops and super admin only', () => {
    for (const role of ['ADMIN_SUPPORT', 'ADMIN_OPS', 'SUPER_ADMIN'])
      expect(canManageIncidents([{ role }])).toBe(true);
    for (const role of ['ADMIN_FINANCE', 'ADMIN_COMPLIANCE', 'OPERATOR_OWNER'])
      expect(canManageIncidents([{ role }])).toBe(false);
  });

  it('offers the next step for each status', () => {
    expect(nextActions('OPEN')).toEqual(['TRIAGE']);
    expect(nextActions('TRIAGED')).toEqual(['RESOLVE']);
    expect(nextActions('RESOLVED')).toEqual(['CLOSE', 'REOPEN']);
    expect(nextActions('CLOSED')).toEqual([]);
  });

  it('marks overdue and critical red, finished green', () => {
    expect(incidentTone({ status: 'OPEN', severity: 'LOW', overdue: true })).toBe(
      'pk-badge--rejected',
    );
    expect(incidentTone({ status: 'OPEN', severity: 'CRITICAL', overdue: false })).toBe(
      'pk-badge--rejected',
    );
    expect(incidentTone({ status: 'OPEN', severity: 'LOW', overdue: false })).toBe(
      'pk-badge--submitted',
    );
    expect(incidentTone({ status: 'RESOLVED', severity: 'CRITICAL', overdue: true })).toBe(
      'pk-badge--approved',
    );
  });
});

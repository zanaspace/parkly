import { describe, expect, it } from 'vitest';
import {
  compareForQueue,
  lotNeedsReview,
  lotReviewWindowStart,
  pagesOnCall,
  severityLabel,
  transition,
  triageDueAt,
  triageOverdue,
} from './incident.js';

const T0 = new Date('2026-11-10T09:00:00Z');
const mins = (m: number) => new Date(T0.getTime() + m * 60_000);

describe('incident status machine', () => {
  it('walks OPEN → TRIAGED → RESOLVED → CLOSED', () => {
    expect(transition({ status: 'OPEN', resolvedAt: null }, 'TRIAGE', T0)).toEqual({
      ok: true,
      to: 'TRIAGED',
    });
    expect(transition({ status: 'TRIAGED', resolvedAt: null }, 'RESOLVE', T0)).toEqual({
      ok: true,
      to: 'RESOLVED',
    });
    expect(transition({ status: 'RESOLVED', resolvedAt: T0 }, 'CLOSE', T0)).toEqual({
      ok: true,
      to: 'CLOSED',
    });
  });

  it('refuses steps out of order', () => {
    expect(transition({ status: 'OPEN', resolvedAt: null }, 'RESOLVE', T0).ok).toBe(false);
    expect(transition({ status: 'CLOSED', resolvedAt: T0 }, 'REOPEN', T0).ok).toBe(false);
    expect(transition({ status: 'TRIAGED', resolvedAt: null }, 'TRIAGE', T0).ok).toBe(false);
  });

  it('reopens a resolved incident for 7 days only', () => {
    const resolved = { status: 'RESOLVED' as const, resolvedAt: T0 };
    expect(transition(resolved, 'REOPEN', new Date(T0.getTime() + 6.9 * 86_400_000))).toEqual({
      ok: true,
      to: 'OPEN',
    });
    expect(transition(resolved, 'REOPEN', new Date(T0.getTime() + 7.1 * 86_400_000)).ok).toBe(
      false,
    );
  });
});

describe('response deadlines', () => {
  it('uses 15 min, 1 h, 8 h and 48 h by severity', () => {
    expect(triageDueAt('CRITICAL', T0)).toEqual(mins(15));
    expect(triageDueAt('HIGH', T0)).toEqual(mins(60));
    expect(triageDueAt('MEDIUM', T0)).toEqual(mins(480));
    expect(triageDueAt('LOW', T0)).toEqual(mins(2880));
  });

  it('is overdue only while still OPEN and past the deadline', () => {
    const open = { status: 'OPEN' as const, severity: 'HIGH' as const, createdAt: T0 };
    expect(triageOverdue(open, mins(59))).toBe(false);
    expect(triageOverdue(open, mins(61))).toBe(true);
    expect(triageOverdue({ ...open, status: 'TRIAGED' }, mins(61))).toBe(false);
    // Reopened after a first response: not late again.
    expect(triageOverdue({ ...open, triagedAt: mins(10) }, mins(61))).toBe(false);
  });
});

describe('queue order and escalation', () => {
  it('sorts worst severity first, then oldest', () => {
    const rows = [
      { id: 'a', severity: 'LOW' as const, createdAt: mins(0) },
      { id: 'b', severity: 'CRITICAL' as const, createdAt: mins(30) },
      { id: 'c', severity: 'CRITICAL' as const, createdAt: mins(10) },
      { id: 'd', severity: 'MEDIUM' as const, createdAt: mins(5) },
    ];
    expect(rows.sort(compareForQueue).map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('labels severities S1 to S4', () => {
    expect([
      severityLabel('CRITICAL'),
      severityLabel('HIGH'),
      severityLabel('MEDIUM'),
      severityLabel('LOW'),
    ]).toEqual(['S1', 'S2', 'S3', 'S4']);
  });

  it('flags a lot at 3 incidents in 30 days', () => {
    expect(lotNeedsReview(2)).toBe(false);
    expect(lotNeedsReview(3)).toBe(true);
    expect(lotReviewWindowStart(T0)).toEqual(new Date('2026-10-11T09:00:00Z'));
  });

  it('pages on-call only for critical', () => {
    expect(pagesOnCall('CRITICAL')).toBe(true);
    expect(pagesOnCall('HIGH')).toBe(false);
  });
});

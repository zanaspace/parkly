/**
 * Incidents (doc 02 §3.6, doc 03 §4.5): pure rules for the status machine,
 * response deadlines and when a lot needs a review (FR-INC-001, FR-INC-004).
 */

export const INCIDENT_CATEGORIES = [
  'SAFETY',
  'DAMAGE',
  'THEFT',
  'OVERCHARGE',
  'TOUT',
  'ACCESS_DENIED',
  'LOT_FULL',
  'APP_ISSUE',
  'OTHER',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/** The PRD calls these S1 (worst) to S4; the database stores the words. */
export const INCIDENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = ['OPEN', 'TRIAGED', 'RESOLVED', 'CLOSED'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  CRITICAL: 'S1',
  HIGH: 'S2',
  MEDIUM: 'S3',
  LOW: 'S4',
};

export const severityLabel = (s: IncidentSeverity): string => SEVERITY_LABEL[s];

/** Worst first, for the queue: "sorted by severity then age" (doc 03 §4.5). */
const SEVERITY_RANK: Record<IncidentSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function compareForQueue(
  a: { severity: IncidentSeverity; createdAt: Date },
  b: { severity: IncidentSeverity; createdAt: Date },
): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/**
 * Minutes to a first response (OPEN → TRIAGED). HIGH 1 h, MEDIUM 8 h and LOW 48 h
 * are doc 03 §4.5; CRITICAL 15 min is our choice, as it pages on-call.
 */
export const TRIAGE_SLA_MINUTES: Record<IncidentSeverity, number> = {
  CRITICAL: 15,
  HIGH: 60,
  MEDIUM: 8 * 60,
  LOW: 48 * 60,
};

export function triageDueAt(severity: IncidentSeverity, createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAGE_SLA_MINUTES[severity] * 60_000);
}

/** True when still OPEN, never yet triaged (a reopened one is not late again), and past the deadline. */
export function triageOverdue(
  incident: {
    status: IncidentStatus;
    severity: IncidentSeverity;
    createdAt: Date;
    triagedAt?: Date | null;
  },
  now: Date,
): boolean {
  return (
    incident.status === 'OPEN' &&
    !incident.triagedAt &&
    now.getTime() > triageDueAt(incident.severity, incident.createdAt).getTime()
  );
}

/** A resolved incident can be reopened for this long (doc 02 §3.6). */
export const REOPEN_WINDOW_DAYS = 7;

export type IncidentAction = 'TRIAGE' | 'RESOLVE' | 'CLOSE' | 'REOPEN';

const NEXT: Record<IncidentAction, { from: IncidentStatus[]; to: IncidentStatus }> = {
  TRIAGE: { from: ['OPEN'], to: 'TRIAGED' },
  RESOLVE: { from: ['TRIAGED'], to: 'RESOLVED' },
  CLOSE: { from: ['RESOLVED'], to: 'CLOSED' },
  REOPEN: { from: ['RESOLVED'], to: 'OPEN' },
};

export type TransitionResult = { ok: true; to: IncidentStatus } | { ok: false; reason: string };

export function transition(
  incident: { status: IncidentStatus; resolvedAt: Date | null },
  action: IncidentAction,
  now: Date,
): TransitionResult {
  const rule = NEXT[action];
  if (!rule.from.includes(incident.status))
    return {
      ok: false,
      reason: `Can't ${action.toLowerCase()} an incident that is ${incident.status}`,
    };
  if (action === 'REOPEN') {
    const resolvedAt = incident.resolvedAt;
    const limit = resolvedAt ? resolvedAt.getTime() + REOPEN_WINDOW_DAYS * 86_400_000 : 0;
    if (now.getTime() > limit)
      return {
        ok: false,
        reason: `Reopening is allowed for ${REOPEN_WINDOW_DAYS} days after it is resolved`,
      };
  }
  return { ok: true, to: rule.to };
}

/** FR-INC-004: this many incidents at one lot inside the window flags it for review. */
export const LOT_REVIEW_INCIDENT_COUNT = 3;
export const LOT_REVIEW_WINDOW_DAYS = 30;

export const lotReviewWindowStart = (now: Date): Date =>
  new Date(now.getTime() - LOT_REVIEW_WINDOW_DAYS * 86_400_000);

export const lotNeedsReview = (incidentsInWindow: number): boolean =>
  incidentsInWindow >= LOT_REVIEW_INCIDENT_COUNT;

/** FR-INC-004: a critical incident pages on-call ops. */
export const pagesOnCall = (severity: IncidentSeverity): boolean => severity === 'CRITICAL';

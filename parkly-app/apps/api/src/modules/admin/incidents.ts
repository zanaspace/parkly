import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AddIncidentNoteRequestSchema,
  CreateIncidentRequestSchema,
  CreateIncidentResponseSchema,
  IncidentActionRequestSchema,
  IncidentDetailSchema,
  IncidentListQuerySchema,
  IncidentListSchema,
  IncidentNoteSchema,
  IncidentSchema,
  LotIncidentFlagsSchema,
} from '@parkly/contracts';
import {
  LOT_REVIEW_INCIDENT_COUNT,
  LOT_REVIEW_WINDOW_DAYS,
  lotNeedsReview,
  lotReviewWindowStart,
  pagesOnCall,
  severityLabel,
  transition,
  triageDueAt,
  triageOverdue,
  type IncidentAction,
} from '@parkly/domain/incident';
import type { AppDeps } from '../../app.js';
import { authenticate, authorize, loadActor, type AuthEnv } from '../../auth/context.js';
import { audit } from '../../lib/audit.js';
import { ApiError } from '../../lib/errors.js';
import type { IncidentNoteRow, IncidentRow } from '../../store/types.js';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const IdParam = z.object({ id: z.uuid() });

const AUDIT_ACTION: Record<IncidentAction, string> = {
  TRIAGE: 'incident.triaged',
  RESOLVE: 'incident.resolved',
  CLOSE: 'incident.closed',
  REOPEN: 'incident.reopened',
};

/**
 * FR-INC-001 and FR-INC-004 (doc 03 §4.5): support and ops log incidents
 * against a lot, triage them, add notes, resolve and close them.
 * - A critical incident pages on-call ops.
 * - The incident that takes a lot to 3 in 30 days flags it for review.
 */
export function adminIncidentRoutes(deps: AppDeps) {
  const app = new OpenAPIHono<AuthEnv>();
  const secured = {
    security: [{ bearerAuth: [] }],
    middleware: [authenticate(deps.verifyToken), loadActor(deps.store)],
  };

  function serialize(r: IncidentRow) {
    const now = deps.now();
    return {
      id: r.id,
      lotId: r.lotId,
      lotName: r.lotName,
      bookingId: r.bookingId,
      bookingCode: r.bookingCode,
      category: r.category,
      severity: r.severity,
      severityLabel: severityLabel(r.severity),
      status: r.status,
      description: r.description,
      reporterRole: r.reporterRole,
      assigneeId: r.assigneeId,
      resolution: r.resolution,
      createdAt: r.createdAt.toISOString(),
      triageDueAt: triageDueAt(r.severity, r.createdAt).toISOString(),
      overdue: triageOverdue(r, now),
      triagedAt: r.triagedAt?.toISOString() ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
    };
  }

  const serializeNote = (n: IncidentNoteRow) => ({
    id: n.id,
    authorId: n.authorId,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
  });

  async function load(id: string): Promise<IncidentRow> {
    const row = await deps.store.incidents.find(id);
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }

  /** Until an on-call provider is chosen (owner decision), an error-level log that Sentry picks up. */
  const page =
    deps.pageOnCall ??
    (async (alert: { incidentId: string; lotName: string; category: string }) => {
      deps.logger.error(
        { event: 'incident.critical', ...alert },
        'critical incident: page on-call ops',
      );
    });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/incidents',
      tags: ['admin'],
      ...secured,
      request: { body: { ...json(CreateIncidentRequestSchema), required: true } },
      responses: { 201: { description: 'Incident logged', ...json(CreateIncidentResponseSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'incident:manage', {});
      const input = c.req.valid('json');
      const actor = c.get('actor');
      const lot = await deps.store.lots.findById(input.lotId);
      if (!lot) throw new ApiError('NOT_FOUND', 'No such car park');
      if (input.bookingId) {
        const booking = await deps.store.bookings.find(input.bookingId);
        if (!booking || booking.lotId !== lot.id)
          throw new ApiError('VALIDATION_FAILED', 'That booking is not at this car park');
      }

      const now = deps.now();
      const row = await deps.store.incidents.create(
        {
          lotId: input.lotId,
          bookingId: input.bookingId ?? null,
          reporterUserId: actor.userId,
          reporterRole: actor.roles.map((r) => r.role).join(',') || 'STAFF',
          category: input.category,
          severity: input.severity,
          description: input.description,
        },
        now,
      );
      await audit(c, deps, {
        action: 'incident.created',
        entityType: 'incident',
        entityId: row.id,
        after: {
          lotId: row.lotId,
          bookingId: row.bookingId,
          category: row.category,
          severity: row.severity,
        },
      });

      if (pagesOnCall(row.severity)) {
        // S1 paging hook (FR-INC-004). A failed page never loses the incident.
        try {
          await page({ incidentId: row.id, lotName: row.lotName, category: row.category });
        } catch (err) {
          deps.logger.error({ err, incidentId: row.id }, 'paging on-call for incident failed');
        }
      }

      // Flag on the incident that reaches the count, not on every one after it.
      const inWindow = await deps.store.incidents.countForLot(row.lotId, lotReviewWindowStart(now));
      const lotFlaggedForReview =
        lotNeedsReview(inWindow) && inWindow === LOT_REVIEW_INCIDENT_COUNT;
      if (lotFlaggedForReview) {
        await audit(c, deps, {
          action: 'lot.flagged_for_review',
          entityType: 'lot',
          entityId: row.lotId,
          after: { incidentCount: inWindow, windowDays: LOT_REVIEW_WINDOW_DAYS },
        });
        deps.logger.warn(
          { event: 'lot.flagged_for_review', lotId: row.lotId, incidentCount: inWindow },
          'lot flagged for review',
        );
      }
      return c.json({ incident: serialize(row), lotFlaggedForReview }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/incidents',
      tags: ['admin'],
      ...secured,
      request: { query: IncidentListQuerySchema },
      responses: { 200: { description: 'Incident queue', ...json(IncidentListSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'incident:manage', {});
      const { status, lotId, severity } = c.req.valid('query');
      const rows = await deps.store.incidents.list({ status, lotId, severity, limit: 200 });
      return c.json({ items: rows.map(serialize) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/incidents/lot-flags',
      tags: ['admin'],
      ...secured,
      responses: { 200: { description: 'Lots to review', ...json(LotIncidentFlagsSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'incident:manage', {});
      const rows = await deps.store.incidents.lotsOverThreshold(
        lotReviewWindowStart(deps.now()),
        LOT_REVIEW_INCIDENT_COUNT,
      );
      return c.json(
        { items: rows.map((r) => ({ ...r, windowDays: LOT_REVIEW_WINDOW_DAYS })) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/incidents/{id}',
      tags: ['admin'],
      ...secured,
      request: { params: IdParam },
      responses: { 200: { description: 'Incident with notes', ...json(IncidentDetailSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'incident:manage', {});
      const row = await load(c.req.valid('param').id);
      const notes = await deps.store.incidents.notes(row.id);
      return c.json({ incident: serialize(row), notes: notes.map(serializeNote) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/admin/incidents/{id}',
      tags: ['admin'],
      ...secured,
      request: {
        params: IdParam,
        body: { ...json(IncidentActionRequestSchema), required: true },
      },
      responses: { 200: { description: 'Incident updated', ...json(IncidentSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'incident:manage', {});
      const body = c.req.valid('json');
      const actorId = c.get('actor').userId;
      const row = await load(c.req.valid('param').id);
      const now = deps.now();
      const step = transition(row, body.action, now);
      if (!step.ok) throw new ApiError('INVALID_STATE_TRANSITION', step.reason);

      const updated = await deps.store.incidents.transition(
        row.id,
        {
          from: row.status,
          to: step.to,
          assigneeId: body.action === 'TRIAGE' ? (body.assigneeId ?? actorId) : undefined,
          resolution: body.action === 'RESOLVE' ? body.resolution : undefined,
        },
        now,
      );
      // Someone else moved it first.
      if (!updated)
        throw new ApiError(
          'INVALID_STATE_TRANSITION',
          'This incident was just updated by someone else',
        );

      if (body.action === 'REOPEN')
        await deps.store.incidents.addNote(
          {
            incidentId: row.id,
            authorId: actorId,
            body: `Reopened: ${body.reason}`,
            internal: true,
          },
          now,
        );
      await audit(c, deps, {
        action: AUDIT_ACTION[body.action],
        entityType: 'incident',
        entityId: row.id,
        before: { status: row.status, assigneeId: row.assigneeId },
        after: {
          status: updated.status,
          assigneeId: updated.assigneeId,
          ...(body.action === 'RESOLVE' ? { resolution: body.resolution } : {}),
          ...(body.action === 'REOPEN' ? { reason: body.reason } : {}),
        },
      });
      return c.json(serialize(updated), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/incidents/{id}/notes',
      tags: ['admin'],
      ...secured,
      request: {
        params: IdParam,
        body: { ...json(AddIncidentNoteRequestSchema), required: true },
      },
      responses: { 201: { description: 'Note added', ...json(IncidentNoteSchema) } },
    }),
    async (c) => {
      authorize(c, deps.logger, 'incident:manage', {});
      const row = await load(c.req.valid('param').id);
      if (row.status === 'CLOSED')
        throw new ApiError('INVALID_STATE_TRANSITION', 'A closed incident takes no more notes');
      const note = await deps.store.incidents.addNote(
        {
          incidentId: row.id,
          authorId: c.get('actor').userId,
          body: c.req.valid('json').body,
          internal: true,
        },
        deps.now(),
      );
      await audit(c, deps, {
        action: 'incident.note_added',
        entityType: 'incident',
        entityId: row.id,
        after: { noteId: note.id },
      });
      return c.json(serializeNote(note), 201);
    },
  );

  return app;
}

import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { apiAccess, createdAt, id, updatedAt } from './common.js';
import { bookings } from './bookings.js';
import { users } from './identity.js';
import { lots } from './lots.js';

// Doc 02 §2.8 and doc 00 §3.6. Add new values at the end, never reorder.
export const incidentCategoryEnum = pgEnum('incident_category', [
  'SAFETY',
  'DAMAGE',
  'THEFT',
  'OVERCHARGE',
  'TOUT',
  'ACCESS_DENIED',
  'LOT_FULL',
  'APP_ISSUE',
  'OTHER',
]);
export const incidentSeverityEnum = pgEnum('incident_severity', [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);
export const incidentStatusEnum = pgEnum('incident_status', [
  'OPEN',
  'TRIAGED',
  'RESOLVED',
  'CLOSED',
]);

/**
 * FR-INC-001: a safety or service issue at a lot, logged by staff (drivers and
 * attendants report in later stories). C3: the description and reporter are
 * personal data, kept 3 years after closure (doc 06).
 */
export const incidents = pgTable(
  'incidents',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'restrict' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reporterRole: text('reporter_role').notNull(),
    category: incidentCategoryEnum('category').notNull(),
    severity: incidentSeverityEnum('severity').notNull(),
    description: text('description').notNull(), // C3
    status: incidentStatusEnum('status').notNull().default('OPEN'),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'restrict' }),
    resolution: text('resolution'), // C3
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('incidents_lot_created_idx').on(t.lotId, t.createdAt),
    index('incidents_status_severity_idx').on(t.status, t.severity, t.createdAt),
    index('incidents_booking_idx').on(t.bookingId),
    index('incidents_reporter_idx').on(t.reporterUserId),
    index('incidents_assignee_idx').on(t.assigneeId),
    apiAccess('incidents'),
  ],
).enableRLS();

/** Working notes on an incident. `internal` notes are never shown outside Parkly. */
export const incidentNotes = pgTable(
  'incident_notes',
  {
    id: id(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(), // C3
    internal: boolean('internal').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('incident_notes_incident_idx').on(t.incidentId, t.createdAt),
    index('incident_notes_author_idx').on(t.authorId),
    apiAccess('incident_notes'),
  ],
).enableRLS();

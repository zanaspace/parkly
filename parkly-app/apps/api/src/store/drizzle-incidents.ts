import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import { and, asc, count, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { IncidentNoteRow, IncidentRow, Store } from './types.js';

const { incidents, incidentNotes, lots, operators, bookings } = schema;

const columns = {
  id: incidents.id,
  lotId: incidents.lotId,
  lotName: lots.name,
  bookingId: incidents.bookingId,
  bookingCode: bookings.code,
  reporterUserId: incidents.reporterUserId,
  reporterRole: incidents.reporterRole,
  category: incidents.category,
  severity: incidents.severity,
  description: incidents.description,
  status: incidents.status,
  assigneeId: incidents.assigneeId,
  resolution: incidents.resolution,
  triagedAt: incidents.triagedAt,
  resolvedAt: incidents.resolvedAt,
  closedAt: incidents.closedAt,
  createdAt: incidents.createdAt,
};

/** Worst first: CRITICAL, HIGH, MEDIUM, LOW (the enum order is the other way round). */
const severityRank = sql`case ${incidents.severity}
  when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end`;

/** FR-INC-001, FR-INC-004: incidents staff log and work. */
export function drizzleIncidents(db: Db): Store['incidents'] {
  const base = () =>
    db
      .select(columns)
      .from(incidents)
      .innerJoin(lots, eq(incidents.lotId, lots.id))
      .leftJoin(bookings, eq(incidents.bookingId, bookings.id));

  async function find(id: string): Promise<IncidentRow | null> {
    const [row] = await base().where(eq(incidents.id, id));
    return (row as IncidentRow | undefined) ?? null;
  }

  return {
    async create(input, at) {
      const [row] = await db
        .insert(incidents)
        .values({ id: uuidv7(), ...input, createdAt: at, updatedAt: at })
        .returning({ id: incidents.id });
      const created = row ? await find(row.id) : null;
      if (!created) throw new Error('incident not saved');
      return created;
    },

    find,

    async list({ status, lotId, severity, limit }) {
      const where: SQL[] = [];
      if (status) where.push(eq(incidents.status, status));
      if (lotId) where.push(eq(incidents.lotId, lotId));
      if (severity) where.push(eq(incidents.severity, severity));
      const rows = await base()
        .where(where.length ? and(...where) : undefined)
        .orderBy(severityRank, asc(incidents.createdAt))
        .limit(limit);
      return rows as IncidentRow[];
    },

    async transition(id, change, at) {
      const set: Partial<typeof incidents.$inferInsert> = { status: change.to, updatedAt: at };
      if (change.to === 'TRIAGED') {
        set.triagedAt = at;
        if (change.assigneeId) set.assigneeId = change.assigneeId;
      }
      if (change.to === 'RESOLVED') {
        set.resolvedAt = at;
        if (change.resolution !== undefined) set.resolution = change.resolution;
      }
      if (change.to === 'CLOSED') set.closedAt = at;
      if (change.to === 'OPEN') set.resolvedAt = null; // reopened
      // Only from the expected status, so two staff acting at once can't both win.
      const [row] = await db
        .update(incidents)
        .set(set)
        .where(and(eq(incidents.id, id), eq(incidents.status, change.from)))
        .returning({ id: incidents.id });
      return row ? find(id) : null;
    },

    async addNote(input, at) {
      const [row] = await db
        .insert(incidentNotes)
        .values({ id: uuidv7(), ...input, createdAt: at })
        .returning({
          id: incidentNotes.id,
          incidentId: incidentNotes.incidentId,
          authorId: incidentNotes.authorId,
          body: incidentNotes.body,
          internal: incidentNotes.internal,
          createdAt: incidentNotes.createdAt,
        });
      if (!row) throw new Error('incident note not saved');
      return row as IncidentNoteRow;
    },

    async notes(incidentId) {
      const rows = await db
        .select({
          id: incidentNotes.id,
          incidentId: incidentNotes.incidentId,
          authorId: incidentNotes.authorId,
          body: incidentNotes.body,
          internal: incidentNotes.internal,
          createdAt: incidentNotes.createdAt,
        })
        .from(incidentNotes)
        .where(eq(incidentNotes.incidentId, incidentId))
        .orderBy(asc(incidentNotes.createdAt), asc(incidentNotes.id));
      return rows as IncidentNoteRow[];
    },

    async countForLot(lotId, since) {
      const [row] = await db
        .select({ n: count() })
        .from(incidents)
        .where(and(eq(incidents.lotId, lotId), gte(incidents.createdAt, since)));
      return row?.n ?? 0;
    },

    async lotsOverThreshold(since, minCount) {
      const n = count();
      const rows = await db
        .select({
          lotId: incidents.lotId,
          lotName: lots.name,
          operatorName: operators.tradingName,
          incidentCount: n,
        })
        .from(incidents)
        .innerJoin(lots, eq(incidents.lotId, lots.id))
        .innerJoin(operators, eq(lots.operatorId, operators.id))
        .where(gte(incidents.createdAt, since))
        .groupBy(incidents.lotId, lots.name, operators.tradingName)
        .having(sql`${n} >= ${minCount}`)
        .orderBy(desc(n), asc(lots.name));
      return rows;
    },
  };
}

import { randomUUID } from 'node:crypto';
import { applyWalkIn } from '@parkly/domain/checkin';
import type { MemoryBookings } from './memory-bookings.js';
import { planEvent, type PlanSession } from './attend-plan.js';
import type {
  AttendDeviceRow,
  AttendEventInput,
  AttendEventResult,
  LotKeyRow,
  LotRow,
  SlotRow,
  Store,
  UserRow,
} from './types.js';

const SLOT_MS = 15 * 60_000;

type Session = PlanSession & {
  bookingId: string;
  lotId: string;
  plateNorm: string;
  overstayMinutes: number;
  overstayAmountKobo: number;
};
type EventRow = AttendEventResult & { type: AttendEventInput['type']; lotId: string };

/** Attendant devices, manifest and sync for MemoryStore (mirrors the SQL and DrizzleStore). */
export class MemoryAttend {
  readonly deviceRows: AttendDeviceRow[] = [];
  readonly sessionRows: Session[] = [];
  readonly eventRows: EventRow[] = [];
  readonly batchIds = new Set<string>();
  readonly walkInCounts = new Map<string, number>();

  constructor(
    private readonly deps: {
      bookings: MemoryBookings;
      lotRows: Map<string, LotRow>;
      slotRows: SlotRow[];
      userRows: Map<string, UserRow>;
      lotKeyRows: LotKeyRow[];
    },
  ) {}

  /** Like fn_rebook_no_show: the remaining slots again, or false if one is full. */
  private rebook(bookingId: string, at: Date): boolean {
    const b = this.deps.bookings.bookingRows.find((r) => r.id === bookingId);
    const lot = b && this.deps.lotRows.get(b.lotId);
    if (!b || !lot) return false;
    const from = Math.max(b.startAt.getTime(), Math.floor(at.getTime() / SLOT_MS) * SLOT_MS);
    const slots: SlotRow[] = [];
    for (let t = from; t < b.endAt.getTime(); t += SLOT_MS) {
      let row = this.deps.slotRows.find((s) => s.lotId === b.lotId && s.slotStart.getTime() === t);
      if (!row) {
        row = {
          lotId: b.lotId,
          slotStart: new Date(t),
          capacity: lot.capacityBookable,
          booked: 0,
          held: 0,
          passReserved: 0,
          blocked: 0,
        };
        this.deps.slotRows.push(row);
      }
      slots.push(row);
    }
    if (slots.some((s) => s.capacity - s.booked - s.held - s.passReserved - s.blocked < 1))
      return false;
    for (const s of slots) s.booked += 1;
    return true;
  }

  readonly attend: Store['attend'] = {
    device: async (userId, clientDeviceId) => {
      const d = this.deviceRows.find(
        (r) => r.userId === userId && r.clientDeviceId === clientDeviceId,
      );
      return d ? { ...d } : null;
    },

    registerDevice: async (input) => {
      let d = this.deviceRows.find(
        (r) => r.userId === input.userId && r.clientDeviceId === input.clientDeviceId,
      );
      if (!d) {
        d = {
          id: randomUUID(),
          userId: input.userId,
          clientDeviceId: input.clientDeviceId,
          operatorId: input.operatorId,
          lotId: input.lotId,
          approvedAt: null,
          revokedAt: null,
          lastSeenAt: input.at,
        };
        this.deviceRows.push(d);
      }
      Object.assign(d, { operatorId: input.operatorId, lotId: input.lotId, lastSeenAt: input.at });
      if (input.approve && !d.approvedAt && !d.revokedAt) d.approvedAt = input.at;
      return { ...d };
    },

    operatorDevices: async (operatorId) =>
      this.deviceRows
        .filter((d) => d.operatorId === operatorId)
        .map((d) => ({
          ...d,
          lotName: this.deps.lotRows.get(d.lotId)?.name ?? '',
          attendantName: this.deps.userRows.get(d.userId)?.firstName ?? null,
        })),

    decideDevice: async ({ operatorId, deviceId, decision, at }) => {
      const d = this.deviceRows.find((r) => r.id === deviceId && r.operatorId === operatorId);
      if (!d) return null;
      if (decision === 'approve') Object.assign(d, { approvedAt: at, revokedAt: null });
      else d.revokedAt = at;
      return { ...d };
    },

    manifest: async (lotId, from, to) =>
      this.deps.bookings.bookingRows
        .filter(
          (b) =>
            b.lotId === lotId &&
            b.startAt < to &&
            b.endAt > from &&
            ['CONFIRMED', 'CHECKED_IN', 'NO_SHOW', 'COMPLETED', 'CANCELLED'].includes(b.status),
        )
        .map((b) => {
          const s = this.sessionRows.find((r) => r.bookingId === b.id);
          return {
            id: b.id,
            code: b.code,
            plateNorm: b.plateNorm,
            startAt: b.startAt,
            endAt: b.endAt,
            status: b.status,
            checkedInAt: s?.checkInAt ?? null,
            checkedOutAt: s?.checkOutAt ?? null,
          };
        }),

    walkIns: async (lotId) => this.walkInCounts.get(lotId) ?? 0,

    applyBatch: async (batch, events) => {
      const repeat = this.batchIds.has(batch.id);
      this.batchIds.add(batch.id);
      const results: AttendEventResult[] = [];
      const checkedOut: string[] = [];
      for (const event of events) {
        const known = this.eventRows.find((e) => e.clientEventId === event.clientEventId);
        if (known || repeat) {
          results.push({
            clientEventId: event.clientEventId,
            result: 'DUPLICATE',
            reason: 'ALREADY_SYNCED',
          });
          continue;
        }
        const bookingId = 'bookingId' in event ? event.bookingId : null;
        const b = bookingId
          ? this.deps.bookings.bookingRows.find((r) => r.id === bookingId)
          : undefined;
        let session = b ? (this.sessionRows.find((s) => s.bookingId === b.id) ?? null) : null;
        const plan = planEvent({
          event,
          batch,
          booking: b
            ? { id: b.id, lotId: b.lotId, status: b.status, plateNorm: b.plateNorm }
            : null,
          session,
        });
        let { result, reason } = plan;
        if (plan.walkInDelta)
          this.walkInCounts.set(
            batch.lotId,
            applyWalkIn(this.walkInCounts.get(batch.lotId) ?? 0, plan.walkInDelta).count,
          );
        if (b && plan.session) {
          if (!session) {
            session = {
              id: randomUUID(),
              bookingId: b.id,
              lotId: b.lotId,
              plateNorm: b.plateNorm,
              checkInAt: null,
              checkOutAt: null,
              flags: [],
              overstayMinutes: 0,
              overstayAmountKobo: 0,
            };
            this.sessionRows.push(session as Session);
          }
          const s = session as Session;
          if (plan.session.checkInAt) s.checkInAt = plan.session.checkInAt;
          if (plan.session.checkOutAt) {
            s.checkOutAt = plan.session.checkOutAt;
            checkedOut.push(s.id);
          }
          s.flags = [...new Set([...s.flags, ...plan.session.addFlags])];
          if (plan.booking) {
            if (plan.rebookNoShow && !this.rebook(b.id, plan.occurredAt)) {
              // The car is inside anyway: record it, keep NO_SHOW, ops decide.
              s.flags = [...new Set([...s.flags, 'NO_CAPACITY'])];
              result = 'CONFLICT';
              reason = 'NO_CAPACITY';
            } else {
              b.status = plan.booking.to;
              this.deps.bookings.historyRows.push({
                bookingId: b.id,
                from: plan.booking.from,
                to: plan.booking.to,
                actor: 'ATTENDANT',
                reason: plan.booking.reason,
              });
            }
          }
        }
        this.eventRows.push({
          clientEventId: event.clientEventId,
          result,
          reason,
          type: event.type,
          lotId: batch.lotId,
        });
        results.push({ clientEventId: event.clientEventId, result, reason });
      }
      return { results, checkedOut };
    },

    session: async (id) => {
      const s = this.sessionRows.find((r) => r.id === id);
      const b = s && this.deps.bookings.bookingRows.find((r) => r.id === s.bookingId);
      if (!s || !b) return null;
      return {
        id: s.id,
        bookingId: b.id,
        lotId: b.lotId,
        endAt: b.endAt,
        commissionBps: b.commissionBps,
        checkOutAt: s.checkOutAt,
      };
    },

    sessionsForBookings: async (ids) =>
      new Map(
        this.sessionRows
          .filter((s) => ids.includes(s.bookingId))
          .map((s) => [
            s.bookingId,
            {
              checkInAt: s.checkInAt,
              checkOutAt: s.checkOutAt,
              overstayMinutes: s.overstayMinutes,
              overstayAmountKobo: s.overstayAmountKobo,
            },
          ]),
      ),

    setOverstay: async (sessionId, minutes, amountKobo) => {
      const s = this.sessionRows.find((r) => r.id === sessionId);
      if (s) Object.assign(s, { overstayMinutes: minutes, overstayAmountKobo: amountKobo });
    },
  };

  readonly forManifest: Store['lotKeys']['forManifest'] = async (lotId) => ({
    valid: this.deps.lotKeyRows
      .filter((k) => k.lotId === lotId && k.status !== 'REVOKED')
      .map((k) => ({ ...k })),
    revokedKids: this.deps.lotKeyRows
      .filter((k) => k.lotId === lotId && k.status === 'REVOKED')
      .map((k) => k.kid),
  });
}

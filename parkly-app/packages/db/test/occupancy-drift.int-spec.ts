import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

// Runs against `supabase start` (CI, or locally with Docker). Default is the local stack.
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(url, { max: 1 });

afterAll(() => sql.end());

class Rollback extends Error {}
type Tx = postgres.TransactionSql;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a row');
  return value;
}

/** Runs `fn` in a transaction that is always rolled back, so tests leave no rows. */
async function inRolledBackTx(fn: (tx: Tx) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

let seq = 0;
const next = () => String(++seq).padStart(5, '0');
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function newUser(tx: Tx): Promise<string> {
  const [u] = await tx`
    insert into auth.users (id, phone, aud, role)
    values (gen_random_uuid(), ${`23480772${next()}`}, 'authenticated', 'authenticated')
    returning id`;
  return must(u).id as string;
}

async function newLot(tx: Tx) {
  const tag = next();
  const [operator] = await tx`
    insert into public.operators (id, legal_name, trading_name, type, status)
    values (gen_random_uuid(), ${`Drift test ${tag}`}, 'Drift test', 'HOTEL', 'ACTIVE')
    returning id`;
  const [lot] = await tx`
    insert into public.lots (id, operator_id, type, name, slug, address_line, location,
                             capacity_total, capacity_bookable, status)
    values (gen_random_uuid(), ${must(operator).id}, 'HOTEL', 'Drift lot', ${`drift-${tag}`},
            '1 Test Road', extensions.st_setsrid(extensions.st_makepoint(3.42, 6.43), 4326)::extensions.geography,
            4, 2, 'LIVE')
    returning id`;
  const [plan] = await tx`
    insert into public.rate_plans (id, lot_id, product, status, hourly_rate_kobo)
    values (gen_random_uuid(), ${must(lot).id}, 'HOURLY', 'ACTIVE', 50000) returning id`;
  return { lotId: must(lot).id as string, ratePlanId: must(plan).id as string };
}

/** A paid booking moved into the past, checked in and never checked out. */
async function parkedSince(
  tx: Tx,
  lot: { lotId: string; ratePlanId: string },
  endedHoursAgo: number,
): Promise<{ bookingId: string; sessionId: string; endAt: string }> {
  const driver = await newUser(tx);
  const [v] = await tx`
    insert into public.vehicles (id, user_id, plate_raw, plate_norm)
    values (gen_random_uuid(), ${driver}, 'LND 123 AB', 'LND123AB') returning id`;
  const start = new Date(Math.ceil(Date.now() / 900_000) * 900_000 + 3_600_000).toISOString();
  const end = new Date(Date.parse(start) + 2 * 3_600_000).toISOString();
  const [b] = await tx`
    select public.fn_hold_booking(
      gen_random_uuid(), ${`PK-D${next()}`}, ${driver}, ${must(v).id}, 'LND123AB', ${lot.lotId},
      'HOURLY', ${start}, ${end}, now() + interval '10 minutes', 150000, 10000, 1200,
      ${lot.ratePlanId}, '{}'::jsonb, 'MOBILE'
    ) as id`;
  const bookingId = must(b).id as string;
  await tx`select public.fn_convert_hold(${bookingId})`;
  // Bookings sit on the 15-minute grid (bookings_grid_check).
  const endAt = new Date(
    Math.floor((Date.now() - endedHoursAgo * 3_600_000) / 900_000) * 900_000,
  ).toISOString();
  await tx`
    update public.bookings
       set status = 'CHECKED_IN',
           start_at = ${endAt}::timestamptz - interval '2 hours',
           end_at = ${endAt}
     where id = ${bookingId}`;
  const [s] = await tx`
    insert into public.sessions (id, booking_id, lot_id, plate_norm, check_in_at, entry_method)
    values (gen_random_uuid(), ${bookingId}, ${lot.lotId}, 'LND123AB',
            ${endAt}::timestamptz - interval '2 hours', 'QR')
    returning id`;
  return { bookingId, sessionId: must(s).id as string, endAt };
}

async function gatePhone(tx: Tx, lotId: string): Promise<string> {
  const [d] = await tx`
    insert into public.devices (id, user_id, client_device_id, platform, lot_id, approved_at)
    values (gen_random_uuid(), ${await newUser(tx)}, gen_random_uuid(), 'PWA', ${lotId}, now())
    returning id`;
  return must(d).id as string;
}

async function synced(tx: Tx, deviceId: string, lotId: string, at: string) {
  await tx`
    insert into public.attendant_sync_batches
      (id, device_id, lot_id, attendant_id, event_count, device_sent_at, server_received_at, clock_offset_ms)
    values (gen_random_uuid(), ${deviceId}, ${lotId}, ${await newUser(tx)}, 0, ${at}, ${at}, 0)`;
}

const sessionRow = async (tx: Tx, id: string) =>
  must(
    (
      await tx`select check_out_at, flags, overstay_minutes, overstay_status
                 from public.sessions where id = ${id}`
    )[0],
  );
const status = async (tx: Tx, id: string) =>
  must((await tx`select status from public.bookings where id = ${id}`)[0]).status as string;

describe('fn_close_stale_sessions (gap review G-9)', () => {
  it('closes a session 12 h past its booking’s end, at the end, with no overstay', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx);
      const p = await parkedSince(tx, lot, 13);
      await tx`select public.fn_close_stale_sessions()`;
      const s = await sessionRow(tx, p.sessionId);
      expect(new Date(s.check_out_at as string).toISOString()).toBe(p.endAt);
      expect(s.flags).toContain('AUTO_CLOSED');
      expect(s.overstay_minutes).toBe(0);
      expect(s.overstay_status).toBe('NONE');
      expect(await status(tx, p.bookingId)).toBe('COMPLETED');
      const [h] = await tx`
        select to_status, actor_type, reason from public.booking_status_history
         where booking_id = ${p.bookingId} and to_status = 'COMPLETED'`;
      expect(h).toMatchObject({
        to_status: 'COMPLETED',
        actor_type: 'SYSTEM',
        reason: 'checkout.auto_closed',
      });
    });
  });

  it('leaves a car whose booking ended less than 12 hours ago', async () => {
    await inRolledBackTx(async (tx) => {
      const p = await parkedSince(tx, await newLot(tx), 11);
      await tx`select public.fn_close_stale_sessions()`;
      expect((await sessionRow(tx, p.sessionId)).check_out_at).toBeNull();
      expect(await status(tx, p.bookingId)).toBe('CHECKED_IN');
    });
  });

  it('waits while a gate phone on shift hasn’t synced since the cutoff, then closes after 24 h', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx);
      const phone = await gatePhone(tx, lot.lotId);
      const p = await parkedSince(tx, lot, 13);
      // On shift (synced an hour before the end), silent since: the check-out may be queued.
      await synced(tx, phone, lot.lotId, hoursAgo(14));
      await tx`select public.fn_close_stale_sessions()`;
      expect((await sessionRow(tx, p.sessionId)).check_out_at).toBeNull();

      // It syncs (with nothing for this car): now the session can close.
      await synced(tx, phone, lot.lotId, hoursAgo(0));
      await tx`select public.fn_close_stale_sessions()`;
      expect((await sessionRow(tx, p.sessionId)).flags).toContain('AUTO_CLOSED');

      // A phone silent for over 24 hours after the end no longer holds anything up.
      const other = await newLot(tx);
      const silent = await gatePhone(tx, other.lotId);
      const old = await parkedSince(tx, other, 25);
      await synced(tx, silent, other.lotId, hoursAgo(26));
      await tx`select public.fn_close_stale_sessions()`;
      expect((await sessionRow(tx, old.sessionId)).flags).toContain('AUTO_CLOSED');
    });
  });

  it('never touches a session that was checked out', async () => {
    await inRolledBackTx(async (tx) => {
      const p = await parkedSince(tx, await newLot(tx), 13);
      const out = hoursAgo(12.5);
      await tx`update public.sessions set check_out_at = ${out} where id = ${p.sessionId}`;
      await tx`update public.bookings set status = 'COMPLETED' where id = ${p.bookingId}`;
      await tx`select public.fn_close_stale_sessions()`;
      const s = await sessionRow(tx, p.sessionId);
      expect(new Date(s.check_out_at as string).toISOString()).toBe(out);
      expect(s.flags).not.toContain('AUTO_CLOSED');
    });
  });
});

describe('fn_reset_walk_ins (gap review G-9)', () => {
  it('puts every lot’s walk-in count back to zero', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx);
      await tx`insert into public.lot_walk_ins (lot_id, count) values (${lot.lotId}, 3)`;
      await tx`select public.fn_reset_walk_ins()`;
      const [w] = await tx`select count from public.lot_walk_ins where lot_id = ${lot.lotId}`;
      expect(must(w).count).toBe(0);
    });
  });
});

describe('occupancy drift jobs are scheduled', () => {
  it('runs close-stale-sessions hourly and reset-walk-ins at 03:00 Lagos', async () => {
    const jobs = await sql`
      select jobname, schedule from cron.job
       where jobname in ('close-stale-sessions', 'reset-walk-ins') order by jobname`;
    expect(jobs).toEqual([
      { jobname: 'close-stale-sessions', schedule: '23 * * * *' },
      { jobname: 'reset-walk-ins', schedule: '0 2 * * *' },
    ]);
  });
});

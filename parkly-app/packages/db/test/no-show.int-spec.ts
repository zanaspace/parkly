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

async function newUser(tx: Tx): Promise<string> {
  const [u] = await tx`
    insert into auth.users (id, phone, aud, role)
    values (gen_random_uuid(), ${`23480771${next()}`}, 'authenticated', 'authenticated')
    returning id`;
  return must(u).id as string;
}

/** A LIVE lot; self check-in as asked. */
async function newLot(tx: Tx, selfCheckin: boolean) {
  const tag = next();
  const [operator] = await tx`
    insert into public.operators (id, legal_name, trading_name, type, status)
    values (gen_random_uuid(), ${`No-show test ${tag}`}, 'No-show test', 'HOTEL', 'ACTIVE')
    returning id`;
  const [lot] = await tx`
    insert into public.lots (id, operator_id, type, name, slug, address_line, location,
                             capacity_total, capacity_bookable, status, self_checkin_enabled)
    values (gen_random_uuid(), ${must(operator).id}, 'HOTEL', 'No-show lot', ${`no-show-${tag}`},
            '1 Test Road', extensions.st_setsrid(extensions.st_makepoint(3.42, 6.43), 4326)::extensions.geography,
            4, 2, 'LIVE', ${selfCheckin})
    returning id`;
  const [plan] = await tx`
    insert into public.rate_plans (id, lot_id, product, status, hourly_rate_kobo)
    values (gen_random_uuid(), ${must(lot).id}, 'HOURLY', 'ACTIVE', 50000) returning id`;
  return { lotId: must(lot).id as string, ratePlanId: must(plan).id as string };
}

/** An approved gate phone at the lot. */
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

// Started an hour ago on the 15-minute grid, ends in two hours: past the 30-minute grace.
const slot = (offsetMin: number) =>
  new Date(Math.floor(Date.now() / 900_000) * 900_000 + offsetMin * 60_000).toISOString();
const START = slot(-60);
const END = slot(120);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** A paid (CONFIRMED) booking nobody checked in, holding its slots as booked. */
async function confirmed(tx: Tx, lot: { lotId: string; ratePlanId: string }): Promise<string> {
  const driver = await newUser(tx);
  const [v] = await tx`
    insert into public.vehicles (id, user_id, plate_raw, plate_norm)
    values (gen_random_uuid(), ${driver}, 'LND 123 AB', 'LND123AB') returning id`;
  const [b] = await tx`
    select public.fn_hold_booking(
      gen_random_uuid(), ${`PK-N${next()}`}, ${driver}, ${must(v).id}, 'LND123AB', ${lot.lotId},
      'HOURLY', ${START}, ${END}, now() + interval '10 minutes', 150000, 10000, 1200,
      ${lot.ratePlanId}, '{}'::jsonb, 'MOBILE'
    ) as id`;
  const id = must(b).id as string;
  await tx`select public.fn_convert_hold(${id})`;
  await tx`update public.bookings set status = 'CONFIRMED' where id = ${id}`;
  return id;
}

const status = async (tx: Tx, id: string) =>
  must((await tx`select status from public.bookings where id = ${id}`)[0]).status as string;

/** Booked count in the slot that contains `at`. */
const bookedAt = async (tx: Tx, lotId: string, at: string) =>
  Number(
    must(
      (
        await tx`select booked from public.lot_slot_inventory
                  where lot_id = ${lotId} and slot_start = public.fn_slot_floor(${at}::timestamptz)`
      )[0],
    ).booked,
  );

describe('fn_mark_no_shows waits for offline gates (gap review G-4)', () => {
  it('marks a no-show at a self check-in lot and frees only the slots still to come', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, true);
      const id = await confirmed(tx, lot);
      await tx`select public.fn_mark_no_shows()`;
      expect(await status(tx, id)).toBe('NO_SHOW');
      expect(await bookedAt(tx, lot.lotId, START)).toBe(1); // the past stays booked
      expect(await bookedAt(tx, lot.lotId, slot(60))).toBe(0);
    });
  });

  it('never marks no-shows at a lot nobody can check in at', async () => {
    await inRolledBackTx(async (tx) => {
      const id = await confirmed(tx, await newLot(tx, false));
      await tx`select public.fn_mark_no_shows()`;
      expect(await status(tx, id)).toBe('CONFIRMED');
    });
  });

  it('waits while a gate phone on shift hasn’t synced since the deadline', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, false);
      const phone = await gatePhone(tx, lot.lotId);
      // On shift (synced before the start), then silent: it may hold the check-in.
      await synced(tx, phone, lot.lotId, minutesAgo(70));
      const id = await confirmed(tx, lot);
      await tx`select public.fn_mark_no_shows()`;
      expect(await status(tx, id)).toBe('CONFIRMED');

      // It syncs now, with no check-in for this car: now it's a no-show.
      await synced(tx, phone, lot.lotId, new Date().toISOString());
      await tx`select public.fn_mark_no_shows()`;
      expect(await status(tx, id)).toBe('NO_SHOW');
    });
  });

  it('ignores a phone not used for over 12 hours before the deadline', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, false);
      const old = await gatePhone(tx, lot.lotId);
      await synced(tx, old, lot.lotId, minutesAgo(20 * 60));
      const id = await confirmed(tx, lot);
      await tx`select public.fn_mark_no_shows()`;
      expect(await status(tx, id)).toBe('NO_SHOW');
    });
  });
});

describe('fn_rebook_no_show takes only the slots still to come (gap review G-4)', () => {
  it('re-books from now, so freed slots are never counted twice', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, true);
      const id = await confirmed(tx, lot);
      await tx`select public.fn_mark_no_shows()`;
      // The car had arrived at the start; its check-in syncs late.
      const [r] = await tx`select public.fn_rebook_no_show(${id}, ${START}::timestamptz) as ok`;
      expect(must(r).ok).toBe(true);
      expect(await bookedAt(tx, lot.lotId, START)).toBe(1); // not 2
      expect(await bookedAt(tx, lot.lotId, slot(60))).toBe(1);
    });
  });
});

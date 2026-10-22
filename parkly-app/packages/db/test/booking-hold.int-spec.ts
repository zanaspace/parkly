import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

// Runs against `supabase start` (CI, or locally with Docker). Default is the local stack.
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(url, { max: 1 });

afterAll(() => sql.end());

class Rollback extends Error {}

type Q = postgres.Sql | postgres.TransactionSql;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a row');
  return value;
}

/** Runs `fn` in a transaction that is always rolled back, so tests leave no rows. */
async function inRolledBackTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

/** Runs a statement expected to fail without aborting the surrounding transaction. */
async function failsWith(tx: postgres.TransactionSql, run: () => Promise<unknown>) {
  await tx`savepoint expect_failure`;
  try {
    await run();
  } catch (e) {
    await tx`rollback to savepoint expect_failure`;
    return (e as Error).message;
  }
  throw new Error('expected the statement to fail');
}

type Fixture = { lotId: string; ratePlanId: string };
type Driver = { driverId: string; vehicleId: string };

/** A LIVE lot with `capacity` bookable spaces and an hourly price. */
async function newLot(q: Q, capacity: number, tag: string): Promise<Fixture> {
  const [operator] = await q`
    insert into public.operators (id, legal_name, trading_name, type, status)
    values (gen_random_uuid(), ${`Hold test ${tag}`}, 'Hold test', 'HOTEL', 'ACTIVE') returning id`;
  const [lot] = await q`
    insert into public.lots (id, operator_id, type, name, slug, address_line, location,
                             capacity_total, capacity_bookable, status)
    values (gen_random_uuid(), ${must(operator).id}, 'HOTEL', 'Hold test lot', ${`hold-test-${tag}`},
            '1 Test Road', extensions.st_setsrid(extensions.st_makepoint(3.42, 6.43), 4326)::extensions.geography,
            ${capacity + 2}, ${capacity}, 'LIVE')
    returning id`;
  const [plan] = await q`
    insert into public.rate_plans (id, lot_id, product, status, hourly_rate_kobo)
    values (gen_random_uuid(), ${must(lot).id}, 'HOURLY', 'ACTIVE', 50000) returning id`;
  return { lotId: must(lot).id as string, ratePlanId: must(plan).id as string };
}

let phoneSeq = 0;
/** A driver with one car. */
async function newDriver(q: Q): Promise<Driver> {
  phoneSeq += 1;
  const [driver] = await q`
    insert into auth.users (id, phone, aud, role)
    values (gen_random_uuid(), ${`2348077${String(phoneSeq).padStart(6, '0')}`}, 'authenticated', 'authenticated')
    returning id`;
  const driverId = must(driver).id as string;
  const [vehicle] = await q`
    insert into public.vehicles (id, user_id, plate_raw, plate_norm)
    values (gen_random_uuid(), ${driverId}, 'LND 123 AB', 'LND123AB') returning id`;
  return { driverId, vehicleId: must(vehicle).id as string };
}

// Tomorrow 08:00–10:00 Lagos: eight 15-minute slots.
const day = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const START = `${day}T07:00:00Z`;
const END = `${day}T09:00:00Z`;

let codeSeq = 0;
async function hold(
  q: Q,
  lot: Fixture,
  driver: Driver,
  window: { start: string; end: string } = { start: START, end: END },
): Promise<string> {
  codeSeq += 1;
  const [row] = await q`
    select public.fn_hold_booking(
      gen_random_uuid(), ${`PK-T${String(codeSeq).padStart(5, '0')}`}, ${driver.driverId},
      ${driver.vehicleId}, 'LND123AB', ${lot.lotId}, 'HOURLY', ${window.start}, ${window.end},
      now() + interval '10 minutes', 100000, 10000, 1200, ${lot.ratePlanId}, '{}'::jsonb, 'MOBILE'
    ) as id`;
  return must(row).id as string;
}

async function counts(q: Q, lotId: string) {
  return q`
    select count(*)::int as slots, min(held)::int as min_held, max(held)::int as max_held,
           min(booked)::int as min_booked, max(booked)::int as max_booked
      from public.lot_slot_inventory where lot_id = ${lotId}`;
}

describe('fn_hold_booking (doc 02 §5, ADR 0006)', () => {
  it('creates a PENDING_PAYMENT booking with its history and holds every slot', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 2, '1');
      const id = await hold(tx, lot, await newDriver(tx));
      const [booking] = await tx`
        select status, total_kobo::int as total from public.bookings where id = ${id}`;
      expect(booking).toEqual({ status: 'PENDING_PAYMENT', total: 110000 });
      const history = await tx`
        select from_status, to_status, actor_type from public.booking_status_history
         where booking_id = ${id}`;
      expect(history).toEqual([
        { from_status: null, to_status: 'PENDING_PAYMENT', actor_type: 'DRIVER' },
      ]);
      expect(await counts(tx, lot.lotId)).toEqual([
        { slots: 8, min_held: 1, max_held: 1, min_booked: 0, max_booked: 0 },
      ]);
    });
  });

  it('refuses once the lot is full, even when only part of the window is', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 1, '2');
      await hold(tx, lot, await newDriver(tx), {
        start: `${day}T08:30:00Z`,
        end: `${day}T10:00:00Z`,
      });
      const late = await newDriver(tx);
      expect(await failsWith(tx, () => hold(tx, lot, late))).toBe('BOOKING_SLOT_UNAVAILABLE');
      const [row] = await tx`
        select sum(held)::int as held from public.lot_slot_inventory where lot_id = ${lot.lotId}`;
      expect(must(row).held).toBe(6); // only the first booking's six slots
    });
  });

  it('refuses a lot that is not LIVE, an off-grid window and a car already booked', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 3, '3');
      const driver = await newDriver(tx);
      await hold(tx, lot, driver);
      expect(
        await failsWith(tx, () =>
          hold(tx, lot, driver, { start: `${day}T08:00:00Z`, end: `${day}T11:00:00Z` }),
        ),
      ).toBe('BOOKING_OVERLAP_SAME_VEHICLE');
      expect(
        await failsWith(tx, () =>
          hold(tx, lot, driver, { start: `${day}T12:10:00Z`, end: `${day}T13:00:00Z` }),
        ),
      ).toBe('BOOKING_WINDOW_INVALID');
      // Back to back is fine: windows are half-open.
      await hold(tx, lot, driver, { start: END, end: `${day}T10:00:00Z` });
      await tx`update public.lots set status = 'PAUSED' where id = ${lot.lotId}`;
      const other = await newDriver(tx);
      expect(await failsWith(tx, () => hold(tx, lot, other))).toBe('LOT_NOT_BOOKABLE');
    });
  });

  it('converts a hold into a booking and releases held or booked spaces', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 2, '4');
      const a = await hold(tx, lot, await newDriver(tx));
      const b = await hold(tx, lot, await newDriver(tx));
      await tx`select public.fn_release_slots(${a}, 'held')`;
      await tx`select public.fn_convert_hold(${b})`;
      expect(await counts(tx, lot.lotId)).toEqual([
        { slots: 8, min_held: 0, max_held: 0, min_booked: 1, max_booked: 1 },
      ]);
      await tx`select public.fn_release_slots(${b}, 'booked')`;
      expect(await counts(tx, lot.lotId)).toEqual([
        { slots: 8, min_held: 0, max_held: 0, min_booked: 0, max_booked: 0 },
      ]);
    });
  });

  it('never lets a counter go negative', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 2, '5');
      const a = await hold(tx, lot, await newDriver(tx));
      await tx`select public.fn_release_slots(${a}, 'held')`;
      expect(await failsWith(tx, () => tx`select public.fn_release_slots(${a}, 'held')`)).toMatch(
        /check constraint/,
      );
    });
  });

  it('is callable by the API role only', async () => {
    const rows = await sql`
      select p.proname,
             has_function_privilege('parkly_api', p.oid, 'EXECUTE') as api,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('fn_hold_booking', 'fn_convert_hold', 'fn_release_slots', 'fn_move_booking_slots')
       order by p.proname`;
    expect(rows).toEqual(
      ['fn_convert_hold', 'fn_hold_booking', 'fn_move_booking_slots', 'fn_release_slots'].map(
        (proname) => ({ proname, api: true, anon: false, auth: false }),
      ),
    );
  });
});

describe('ledger and history invariants (doc 02 §2.6–2.7)', () => {
  it('rejects an unbalanced journal at commit', async () => {
    await inRolledBackTx(async (tx) => {
      const [acc] = await tx`
        select id from public.ledger_accounts where code = 'PLATFORM_REVENUE_COMMISSION'`;
      await tx`
        insert into public.ledger_entries (id, journal_id, account_id, direction, amount_kobo)
        values (gen_random_uuid(), gen_random_uuid(), ${must(acc).id}, 'DEBIT', 100)`;
      expect(
        await failsWith(tx, () => tx`set constraints public.ledger_balanced_check immediate`),
      ).toMatch(/unbalanced/);
    });
  });

  it('accepts a balanced journal', async () => {
    await inRolledBackTx(async (tx) => {
      const rows = await tx`
        select code, id from public.ledger_accounts
         where code in ('PROVIDER_CLEARING:PAYSTACK', 'PLATFORM_REVENUE_SERVICE_FEE')`;
      const id = (code: string) => must(rows.find((r) => r.code === code)).id as string;
      const journal = crypto.randomUUID();
      await tx`
        insert into public.ledger_entries (id, journal_id, account_id, direction, amount_kobo) values
          (gen_random_uuid(), ${journal}, ${id('PROVIDER_CLEARING:PAYSTACK')}, 'DEBIT', 10000),
          (gen_random_uuid(), ${journal}, ${id('PLATFORM_REVENUE_SERVICE_FEE')}, 'CREDIT', 10000)`;
      await tx`set constraints public.ledger_balanced_check immediate`;
    });
  });

  it.each(['booking_status_history', 'ledger_entries'])(
    'the API role cannot update or delete %s',
    async (table) => {
      const [row] = await sql`
        select has_table_privilege('parkly_api', ${`public.${table}`}, 'UPDATE') as upd,
               has_table_privilege('parkly_api', ${`public.${table}`}, 'DELETE') as del`;
      expect(row).toEqual({ upd: false, del: false });
    },
  );

  it('blocks changing a status history row, even for the owner', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 1, '6');
      await hold(tx, lot, await newDriver(tx));
      expect(
        await failsWith(tx, () => tx`update public.booking_status_history set reason = 'x'`),
      ).toMatch(/append-only/);
    });
  });

  it('seeds the platform ledger accounts', async () => {
    const rows = await sql`select code, type from public.ledger_accounts order by code`;
    expect(rows.map((r) => `${r.code}:${r.type}`)).toEqual(
      expect.arrayContaining([
        'DRIVER_RECEIVABLE:ASSET',
        'PAYMENT_FEES_EXPENSE:EXPENSE',
        'PLATFORM_REVENUE_COMMISSION:REVENUE',
        'PLATFORM_REVENUE_SERVICE_FEE:REVENUE',
        'PROVIDER_CLEARING:PAYSTACK:ASSET',
        'REFUNDS_CLEARING:LIABILITY',
      ]),
    );
  });
});

// Commits rows, so it runs only against a throwaway local database (CI's `supabase start`).
const isLocal = /@(127\.0\.0\.1|localhost):/.test(url);

describe.runIf(isLocal)('concurrent holds (doc 02 §5, doc 20 S4 exit test)', () => {
  const CAPACITY = 10;
  const DRIVERS = 50;
  const pool = postgres(url, { max: DRIVERS });
  let lot: Fixture | undefined;
  const drivers: Driver[] = [];

  afterAll(async () => {
    const lotId = lot?.lotId;
    // History is append-only for every role; replica mode skips triggers for this cleanup only.
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      if (lotId) {
        await tx`delete from public.booking_status_history where booking_id in
                   (select id from public.bookings where lot_id = ${lotId})`;
        await tx`delete from public.bookings where lot_id = ${lotId}`;
        await tx`delete from public.lot_slot_inventory where lot_id = ${lotId}`;
        await tx`delete from public.rate_plans where lot_id = ${lotId}`;
        const [row] = await tx`delete from public.lots where id = ${lotId} returning operator_id`;
        await tx`delete from public.operators where id = ${must(row).operator_id}`;
      }
      for (const d of drivers) {
        await tx`delete from public.vehicles where id = ${d.vehicleId}`;
        await tx`delete from public.user_roles where user_id = ${d.driverId}`;
        await tx`delete from public.users where id = ${d.driverId}`;
        await tx`delete from auth.users where id = ${d.driverId}`;
      }
    });
    await pool.end();
  });

  it(`gives exactly ${CAPACITY} of ${DRIVERS} simultaneous bookings a space`, async () => {
    const fx = await newLot(sql, CAPACITY, '50');
    lot = fx;
    for (let i = 0; i < DRIVERS; i++) drivers.push(await newDriver(sql));
    const results = await Promise.allSettled(
      drivers.map((d) => pool.begin((tx) => hold(tx, fx, d))),
    );
    const reasons = results.flatMap((r) =>
      r.status === 'rejected' ? [(r.reason as Error).message] : [],
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(CAPACITY);
    expect(reasons).toEqual(Array(DRIVERS - CAPACITY).fill('BOOKING_SLOT_UNAVAILABLE'));
    expect(await counts(sql, fx.lotId)).toEqual([
      { slots: 8, min_held: CAPACITY, max_held: CAPACITY, min_booked: 0, max_booked: 0 },
    ]);
    const [row] = await sql`
      select count(*)::int as n from public.bookings where lot_id = ${fx.lotId}`;
    expect(must(row).n).toBe(CAPACITY);
  });
});

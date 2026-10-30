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

  it('keeps back-to-back bookings to their own slots (P-1)', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 1, '4b');
      // 09:00–10:00 exists first, so the 08:00–09:00 hold sits right before a live slot row.
      const later = await hold(tx, lot, await newDriver(tx), {
        start: END,
        end: `${day}T10:00:00Z`,
      });
      await tx`select public.fn_convert_hold(${later})`;
      const first = await hold(tx, lot, await newDriver(tx));
      await tx`select public.fn_convert_hold(${first})`;
      const rows = await tx`
        select count(*)::int as slots, max(booked)::int as max_booked, max(held)::int as max_held
          from public.lot_slot_inventory where lot_id = ${lot.lotId}`;
      expect(rows).toEqual([{ slots: 12, max_booked: 1, max_held: 0 }]);
      await tx`select public.fn_release_slots(${first}, 'booked')`;
      const [after] = await tx`
        select sum(booked)::int as booked from public.lot_slot_inventory where lot_id = ${lot.lotId}`;
      expect(must(after).booked).toBe(4); // only the later booking's four slots
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

  it('never refunds more than a payment took (gap review P-8)', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 1, 'r1');
      const driver = await newDriver(tx);
      const id = await hold(tx, lot, driver);
      const [op] = await tx`select operator_id from public.lots where id = ${lot.lotId}`;
      const [p] = await tx`
        insert into public.payments (id, kind, booking_id, payer_user_id, provider,
          provider_reference, amount_kobo, platform_amount_kobo, operator_amount_kobo,
          operator_id, status)
        values (gen_random_uuid(), 'BOOKING', ${id}, ${driver.driverId}, 'FAKE',
                gen_random_uuid()::text, 110000, 22000, 88000, ${must(op).operator_id}, 'SUCCEEDED')
        returning id`;
      const refund = (amount: number, status = 'PENDING') => tx`
        insert into public.refunds (id, payment_id, amount_kobo, reason, status)
        values (gen_random_uuid(), ${must(p).id}, ${amount}, 'DRIVER_CANCEL', ${status}::public.refund_status)`;
      await refund(100000);
      await refund(50000, 'FAILED'); // a failed refund takes nothing
      expect(await failsWith(tx, () => refund(10001))).toBe('REFUND_EXCEEDS_PAYMENT');
      await refund(10000);
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

describe('fn_expire_holds (doc 02 §9)', () => {
  it('expires unpaid holds, abandons stale checkouts, purges old keys, once', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 1, '7');
      const driver = await newDriver(tx);
      const id = await hold(tx, lot, driver);
      await tx`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = ${id}`;
      const [op] = await tx`select operator_id from public.lots where id = ${lot.lotId}`;
      await tx`
        insert into public.payments (id, kind, booking_id, payer_user_id, provider,
          provider_reference, amount_kobo, platform_amount_kobo, operator_amount_kobo,
          operator_id, status, created_at)
        values
          (gen_random_uuid(), 'BOOKING', ${id}, ${driver.driverId}, 'FAKE', gen_random_uuid()::text,
           110000, 22000, 88000, ${must(op).operator_id}, 'INITIATED', now()),
          (gen_random_uuid(), 'BOOKING', ${id}, ${driver.driverId}, 'FAKE', gen_random_uuid()::text,
           110000, 22000, 88000, ${must(op).operator_id}, 'PENDING', now() - interval '31 minutes')`;
      await tx`
        insert into public.idempotency_keys (actor_id, key, method, path, request_hash, expires_at)
        values (${driver.driverId}, 'old-key-1', 'POST', '/v1/bookings', repeat('a', 64),
                now() - interval '1 hour')`;

      const [first] = await tx`select public.fn_expire_holds() as r`;
      // Other suites may share the database: check our rows, and at-least counts.
      expect(must(first).r).toMatchObject({
        expired: expect.any(Number),
        abandoned: expect.any(Number),
        purged: expect.any(Number),
      });
      const {
        failed: _f,
        extensions_expired: _e,
        ...done
      } = must(first).r as Record<string, number>;
      for (const n of Object.values(done)) expect(n).toBeGreaterThanOrEqual(1);
      const [booking] = await tx`select status from public.bookings where id = ${id}`;
      expect(must(booking).status).toBe('EXPIRED');
      const payments = await tx`
        select status::text from public.payments where booking_id = ${id} order by status::text`;
      expect(payments.map((p) => p.status)).toEqual(['ABANDONED', 'FAILED']);
      expect(await counts(tx, lot.lotId)).toEqual([
        { slots: 8, min_held: 0, max_held: 0, min_booked: 0, max_booked: 0 },
      ]);
      await tx`select public.fn_expire_holds()`;
      const history = await tx`
        select 1 from public.booking_status_history where booking_id = ${id} and to_status = 'EXPIRED'`;
      expect(history).toHaveLength(1);
    });
  });

  it('keeps expiring other holds when one cannot be released (P-1)', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 2, '7b');
      const broken = await hold(tx, lot, await newDriver(tx));
      const fine = await hold(tx, lot, await newDriver(tx), {
        start: `${day}T10:00:00Z`,
        end: `${day}T11:00:00Z`,
      });
      await tx`update public.bookings set hold_expires_at = now() - interval '1 minute'
                where id in (${broken}, ${fine})`;
      // Losing a slot row makes the release raise, as the widened range did.
      await tx`delete from public.lot_slot_inventory where lot_id = ${lot.lotId} and slot_start = ${START}`;
      const [run] = await tx`select public.fn_expire_holds() as r`;
      expect((must(run).r as { failed: number }).failed).toBeGreaterThanOrEqual(1);
      const statuses = await tx`
        select id, status::text from public.bookings where id in (${broken}, ${fine})`;
      expect(Object.fromEntries(statuses.map((r) => [r.id, r.status]))).toEqual({
        [broken]: 'PENDING_PAYMENT',
        [fine]: 'EXPIRED',
      });
    });
  });

  it('holds one extension per booking, expires it, and confirms only on a live booking (P-4, P-5)', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 2, '7c');
      const id = await hold(tx, lot, await newDriver(tx));
      await tx`select public.fn_convert_hold(${id})`;
      await tx`update public.bookings set status = 'CONFIRMED', hold_expires_at = null where id = ${id}`;
      const extend = async (expires: string) => {
        const [row] = await tx`
          select public.fn_hold_extension(gen_random_uuid(), ${id}, ${`${day}T10:00:00Z`},
                 50000, 6000, 44000, ${expires}::timestamptz) as id`;
        return must(row).id as string;
      };
      const heldAfter = async () => {
        const [row] = await tx`
          select coalesce(sum(held), 0)::int as held from public.lot_slot_inventory
           where lot_id = ${lot.lotId} and slot_start >= ${END}`;
        return must(row).held as number;
      };

      const first = await extend(new Date(Date.now() + 600_000).toISOString());
      const second = await extend(new Date(Date.now() - 60_000).toISOString());
      expect(await heldAfter()).toBe(4);
      const [replaced] =
        await tx`select status::text from public.booking_extensions where id = ${first}`;
      expect(must(replaced).status).toBe('EXPIRED');

      await tx`select public.fn_expire_holds()`;
      expect(await heldAfter()).toBe(0);
      const [gone] =
        await tx`select status::text from public.booking_extensions where id = ${second}`;
      expect(must(gone).status).toBe('EXPIRED');

      const third = await extend(new Date(Date.now() + 600_000).toISOString());
      await tx`select public.fn_cancel_booking(${id}, 'DRIVER', null, 'test')`;
      expect(await heldAfter()).toBe(0);
      expect(
        await failsWith(tx, () => tx`select public.fn_confirm_extension(${third}, null)`),
      ).toBe('EXTENSION_ALREADY_CONFIRMED');
    });
  });

  it('is scheduled every minute', async () => {
    const [job] = await sql`select schedule, command from cron.job where jobname = 'expire-holds'`;
    expect(job).toEqual({ schedule: '* * * * *', command: 'select public.fn_expire_holds()' });
  });
});

describe('fn_mark_no_shows and fn_rebook_no_show (doc 02 §3.1)', () => {
  it('marks a paid booking nobody checked in, keeps past slots, and re-books a late car', async () => {
    await inRolledBackTx(async (tx) => {
      const lot = await newLot(tx, 1, '8');
      // Someone must be able to check the car in for it to be a no-show (G-4):
      // self check-in on, no gate phone to wait for. Offline gates: no-show.int-spec.
      await tx`update public.lots set self_checkin_enabled = true where id = ${lot.lotId}`;
      const [floor] = await tx`select public.fn_slot_floor(now()) - interval '60 minutes' as s`;
      const start = must(floor).s as Date;
      const end = new Date(start.getTime() + 2 * 3600_000);
      const id = await hold(tx, lot, await newDriver(tx), {
        start: start.toISOString(),
        end: end.toISOString(),
      });
      await tx`select public.fn_convert_hold(${id})`;
      await tx`update public.bookings set status = 'CONFIRMED' where id = ${id}`;

      await tx`select public.fn_mark_no_shows()`;
      const [booking] = await tx`select status from public.bookings where id = ${id}`;
      expect(must(booking).status).toBe('NO_SHOW');
      const future = await tx`
        select booked from public.lot_slot_inventory
         where lot_id = ${lot.lotId} and slot_start >= public.fn_slot_floor(now())`;
      expect(future.every((r) => r.booked === 0)).toBe(true);
      const [past] = await tx`
        select booked from public.lot_slot_inventory
         where lot_id = ${lot.lotId} and slot_start = ${start}`;
      expect(must(past).booked).toBe(1);

      await tx`select public.fn_mark_no_shows()`;
      const history = await tx`
        select 1 from public.booking_status_history where booking_id = ${id} and to_status = 'NO_SHOW'`;
      expect(history).toHaveLength(1);

      const [rebooked] = await tx`select public.fn_rebook_no_show(${id}, now()) as ok`;
      expect(must(rebooked).ok).toBe(true);
      const again = await tx`
        select booked from public.lot_slot_inventory
         where lot_id = ${lot.lotId} and slot_start >= public.fn_slot_floor(now())`;
      expect(again.every((r) => r.booked === 1)).toBe(true);
    });
  });

  it('keeps check-in events append-only and the job is scheduled', async () => {
    const [row] = await sql`
      select has_table_privilege('parkly_api', 'public.checkin_events', 'UPDATE') as upd,
             has_table_privilege('parkly_api', 'public.checkin_events', 'DELETE') as del`;
    expect(row).toEqual({ upd: false, del: false });
    const [job] = await sql`select schedule from cron.job where jobname = 'mark-no-shows'`;
    expect(job).toEqual({ schedule: '*/5 * * * *' });
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

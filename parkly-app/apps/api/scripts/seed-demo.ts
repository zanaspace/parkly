/**
 * Loads demo car parks into a dev or local database so driver search has
 * something to show (doc 20 S3 task 7). Data only, never schema.
 *
 *   pnpm --filter @parkly/api seed:demo -- --confirm-dev            add the 12 demo lots
 *   pnpm --filter @parkly/api seed:demo -- --confirm-dev --perf 500 also add 500 lots for the latency check
 *   pnpm --filter @parkly/api seed:demo -- --confirm-dev --remove   delete every demo lot
 *   add --dry-run to any of these to do the work and roll it back
 *
 * Each demo lot gets its own operator named "… (demo)", already KYB-approved,
 * with an approved permit, an approved site visit and live prices, so it is
 * LIVE and listable. Adding is idempotent (existing slugs are skipped).
 */
import { createDb, schema } from '@parkly/db';
import { verificationValidUntil, type VerificationItem } from '@parkly/domain/lot';
import { and, inArray, isNull, like, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { DEMO_LOTS, DEMO_MARK, hoursFor, perfLots, type DemoLot } from './demo-lots.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const perfIndex = args.indexOf('--perf');
const perfCount = perfIndex >= 0 ? Number(args[perfIndex + 1]) : 0;
const dryRun = flag('--dry-run');
const ROLLBACK = new Error('dry run');

const say = (line: string) => process.stdout.write(`${line}\n`);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!flag('--confirm-dev'))
  fail('This writes demo data. Run with --confirm-dev against a dev or local database only.');
if (process.env.APP_ENV === 'prod' || process.env.APP_ENV === 'staging')
  fail(`Refusing to seed demo data with APP_ENV=${process.env.APP_ENV}.`);
if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set (apps/api/.env).');
if (perfIndex >= 0 && !(Number.isInteger(perfCount) && perfCount > 0 && perfCount <= 2000))
  fail('--perf takes a number of lots between 1 and 2000.');

const { db, close } = createDb(process.env.DATABASE_URL);
const {
  operators,
  lots,
  lotOpeningHours,
  permits,
  verificationRecords,
  verificationItems,
  ratePlans,
  userRoles,
} = schema;
const demoOperators = and(like(operators.legalName, `%${DEMO_MARK}`), isNull(operators.createdBy));

async function remove() {
  // Lots must go first (their operator FK restricts deletes); hours, permits,
  // visits, prices and slot inventory cascade from the lot.
  try {
    await db.transaction(async (tx) => {
      const demoIds = tx.select({ id: operators.id }).from(operators).where(demoOperators);
      const lotsGone = await tx
        .delete(lots)
        .where(inArray(lots.operatorId, demoIds))
        .returning({ id: lots.id });
      const removed = await tx
        .delete(operators)
        .where(demoOperators)
        .returning({ id: operators.id });
      say(`Removed ${lotsGone.length} demo lots and ${removed.length} demo operators.`);
      if (dryRun) throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
    say('Dry run: rolled back, nothing kept.');
  }
}

async function add(list: DemoLot[]) {
  const [inspector] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.role, ['SUPER_ADMIN', 'ADMIN_OPS']))
    .limit(1);
  if (!inspector)
    fail('Create an admin (SUPER_ADMIN or ADMIN_OPS) first: demo visits need an inspector.');

  const existing = new Set(
    (
      await db
        .select({ slug: lots.slug })
        .from(lots)
        .where(
          inArray(
            lots.slug,
            list.map((l) => l.slug),
          ),
        )
    ).map((r) => r.slug),
  );
  const todo = list.filter((l) => !existing.has(l.slug));
  const now = new Date();
  const inspectedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Build every row first, then insert each table in chunks: one round trip per
  // chunk instead of per row (the dev database is in Ireland).
  const rows = {
    operators: [] as (typeof operators.$inferInsert)[],
    lots: [] as (typeof lots.$inferInsert)[],
    hours: [] as (typeof lotOpeningHours.$inferInsert)[],
    permits: [] as (typeof permits.$inferInsert)[],
    visits: [] as (typeof verificationRecords.$inferInsert)[],
    items: [] as (typeof verificationItems.$inferInsert)[],
    plans: [] as (typeof ratePlans.$inferInsert)[],
  };
  for (const [i, l] of todo.entries()) {
    const operatorId = uuidv7();
    const lotId = uuidv7();
    const recordId = uuidv7();
    rows.operators.push({
      id: operatorId,
      legalName: `${l.name} Operations Ltd ${DEMO_MARK}`,
      tradingName: l.name,
      type: l.type,
      status: 'ACTIVE',
      kybStatus: 'APPROVED',
      commissionBps: 1200,
    });
    rows.lots.push({
      id: lotId,
      operatorId,
      type: l.type,
      name: l.name,
      slug: l.slug,
      description: `Demo car park on ${l.addressLine}. Not a real Parkly partner.`,
      addressLine: l.addressLine,
      area: l.area,
      lga: 'Eti-Osa',
      location: { lat: l.lat, lng: l.lng },
      entranceNotes: l.entranceNotes,
      capacityTotal: l.capacityTotal,
      capacityBookable: l.capacityBookable,
      amenities: l.amenities,
      vehicleTypes: ['CAR', 'SUV'],
      status: 'LIVE',
      verifiedBadge: true,
    });
    rows.hours.push(...hoursFor(l.hours).map((h) => ({ id: uuidv7(), lotId, ...h })));
    rows.permits.push({
      id: uuidv7(),
      lotId,
      permitNumber: `LASPA/DEMO/${String(i + 1).padStart(4, '0')}`,
      issuedAt: '2026-01-10',
      expiresAt: '2027-06-30',
      status: 'APPROVED',
      reviewedBy: inspector.userId,
      reviewedAt: now,
      reviewNote: 'Demo data',
    });
    rows.visits.push({
      id: recordId,
      lotId,
      inspectorUserId: inspector.userId,
      inspectedAt,
      status: 'APPROVED',
      capacityCounted: l.capacityTotal,
      notes: 'Demo data',
      reviewedBy: inspector.userId,
      reviewedAt: now,
      validUntil: verificationValidUntil(inspectedAt),
    });
    const passed: VerificationItem[] = [
      'LASPA_PERMIT',
      'OWNER_IDENTITY',
      'GUARD_PRESENCE',
      'LIGHTING',
      'CAPACITY_COUNT',
      ...(l.amenities.includes('CCTV') ? (['CCTV'] as const) : []),
      ...(l.amenities.includes('ACCESS_CONTROL') ? (['ACCESS_CONTROL'] as const) : []),
    ];
    rows.items.push(
      ...passed.map((item) => ({ id: uuidv7(), recordId, item, result: 'PASS' as const })),
    );
    const prices = [
      l.hourlyKobo && { product: 'HOURLY' as const, hourlyRateKobo: l.hourlyKobo },
      l.dailyKobo && { product: 'DAILY' as const, dailyRateKobo: l.dailyKobo },
      l.monthlyKobo && { product: 'MONTHLY' as const, monthlyRateKobo: l.monthlyKobo },
    ].filter((p) => !!p);
    rows.plans.push(
      ...prices.map((p) => ({
        id: uuidv7(),
        lotId,
        ...p,
        status: 'ACTIVE' as const,
        effectiveFrom: now,
        approvedBy: inspector.userId,
        approvedAt: now,
      })),
    );
  }

  const CHUNK = 400;
  try {
    await db.transaction(async (tx) => {
      const insertAll = async <T>(rowsOf: T[], insert: (chunk: T[]) => Promise<unknown>) => {
        for (let i = 0; i < rowsOf.length; i += CHUNK) await insert(rowsOf.slice(i, i + CHUNK));
      };
      await insertAll(rows.operators, (c) => tx.insert(operators).values(c));
      await insertAll(rows.lots, (c) => tx.insert(lots).values(c));
      await insertAll(rows.hours, (c) => tx.insert(lotOpeningHours).values(c));
      await insertAll(rows.permits, (c) => tx.insert(permits).values(c));
      await insertAll(rows.visits, (c) => tx.insert(verificationRecords).values(c));
      await insertAll(rows.items, (c) => tx.insert(verificationItems).values(c));
      await insertAll(rows.plans, (c) => tx.insert(ratePlans).values(c));
      const [{ n } = { n: 0 }] = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from public.lots where slug like 'demo-%'`,
      );
      say(`Added ${todo.length} demo lots (${existing.size} already there); ${n} demo lots now.`);
      if (dryRun) throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
    say('Dry run: rolled back, nothing kept.');
  }
}

try {
  if (flag('--remove')) await remove();
  else await add([...DEMO_LOTS, ...(perfCount > 0 ? perfLots(perfCount) : [])]);
} finally {
  await close();
}

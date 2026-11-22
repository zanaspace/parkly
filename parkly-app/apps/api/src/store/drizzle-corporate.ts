import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Db } from '@parkly/db';
import { schema } from '@parkly/db';
import type {
  CorporateBookingItem,
  CorporateBookingStatus,
  CorporateCostCenterSummary,
  CorporateFinanceSummary,
} from '@parkly/contracts';
import type { CorporateBookingRow } from './types.js';

const { corporateBookings, bookings, lots, users, corporateCostCenters } = schema;

export function currentBillingPeriod(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export async function recordCorporateBooking(
  db: Db,
  data: {
    id?: string;
    corporateId: string;
    bookingId: string;
    driverUserId: string;
    costCenterId?: string | null;
    workEmail?: string | null;
    companyName?: string | null;
    amountKobo: number;
    serviceFeeKobo?: number;
    vatKobo?: number;
    billingPeriod?: string;
    status?: CorporateBookingStatus;
  },
): Promise<CorporateBookingRow> {
  const period = data.billingPeriod ?? currentBillingPeriod();
  const serviceFee = data.serviceFeeKobo ?? 0;
  const vat = data.vatKobo ?? Math.round(data.amountKobo * 0.075);

  const [row] = await db
    .insert(corporateBookings)
    .values({
      id: data.id ?? uuidv7(),
      corporateId: data.corporateId,
      bookingId: data.bookingId,
      driverUserId: data.driverUserId,
      costCenterId: data.costCenterId ?? null,
      workEmail: data.workEmail ?? null,
      companyName: data.companyName ?? 'Corporate',
      amountKobo: data.amountKobo,
      serviceFeeKobo: serviceFee,
      vatKobo: vat,
      billingPeriod: period,
      status: data.status ?? 'ACCRUED',
    })
    .returning();

  return row as CorporateBookingRow;
}

export async function listCorporateBookings(
  db: Db,
  corporateId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: CorporateBookingStatus;
    billingPeriod?: string;
  },
): Promise<CorporateBookingItem[]> {
  const conditions = [eq(corporateBookings.corporateId, corporateId)];
  if (options?.status) {
    conditions.push(eq(corporateBookings.status, options.status));
  }
  if (options?.billingPeriod) {
    conditions.push(eq(corporateBookings.billingPeriod, options.billingPeriod));
  }

  const query = db
    .select({
      id: corporateBookings.id,
      corporateId: corporateBookings.corporateId,
      bookingId: corporateBookings.bookingId,
      driverUserId: corporateBookings.driverUserId,
      costCenterId: corporateBookings.costCenterId,
      workEmail: corporateBookings.workEmail,
      companyName: corporateBookings.companyName,
      amountKobo: corporateBookings.amountKobo,
      serviceFeeKobo: corporateBookings.serviceFeeKobo,
      vatKobo: corporateBookings.vatKobo,
      billingPeriod: corporateBookings.billingPeriod,
      status: corporateBookings.status,
      createdAt: corporateBookings.createdAt,
      bookingCode: bookings.code,
      product: bookings.product,
      startsAt: bookings.startAt,
      endsAt: bookings.endAt,
      driverFirstName: users.firstName,
      driverLastName: users.lastName,
      vehiclePlate: bookings.plateNormSnapshot,
      costCenterName: corporateCostCenters.name,
      lotName: lots.name,
    })
    .from(corporateBookings)
    .innerJoin(bookings, eq(corporateBookings.bookingId, bookings.id))
    .leftJoin(lots, eq(bookings.lotId, lots.id))
    .leftJoin(users, eq(corporateBookings.driverUserId, users.id))
    .leftJoin(corporateCostCenters, eq(corporateBookings.costCenterId, corporateCostCenters.id))
    .where(and(...conditions))
    .orderBy(desc(corporateBookings.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  const rows = await query;

  return rows.map((r) => {
    const driverFullName = [r.driverFirstName, r.driverLastName].filter(Boolean).join(' ').trim();
    return {
      id: r.id,
      corporateId: r.corporateId,
      bookingId: r.bookingId,
      driverUserId: r.driverUserId,
      costCenterId: r.costCenterId,
      workEmail: r.workEmail,
      companyName: r.companyName,
      amountKobo: r.amountKobo,
      serviceFeeKobo: r.serviceFeeKobo,
      vatKobo: r.vatKobo,
      billingPeriod: r.billingPeriod,
      status: r.status as CorporateBookingStatus,
      createdAt: r.createdAt.toISOString(),
      bookingCode: r.bookingCode,
      lotName: r.lotName ?? 'Parkly Lot',
      product: r.product,
      startsAt: r.startsAt?.toISOString(),
      endsAt: r.endsAt?.toISOString(),
      driverName: driverFullName || (r.workEmail ? r.workEmail.split('@')[0] : 'Corporate Driver'),
      vehiclePlate: r.vehiclePlate ?? undefined,
      costCenterName: r.costCenterName ?? 'General Operations',
    };
  });
}

export async function getCorporateFinanceSummary(
  db: Db,
  corporateId: string,
  billingPeriod?: string,
): Promise<CorporateFinanceSummary> {
  const period = billingPeriod ?? currentBillingPeriod();

  const bookingRows = await db
    .select({
      amountKobo: corporateBookings.amountKobo,
      serviceFeeKobo: corporateBookings.serviceFeeKobo,
      vatKobo: corporateBookings.vatKobo,
      driverUserId: corporateBookings.driverUserId,
      costCenterId: corporateBookings.costCenterId,
    })
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.corporateId, corporateId),
        eq(corporateBookings.billingPeriod, period),
      ),
    );

  let subtotalKobo = 0;
  let serviceFeeKobo = 0;
  let vatKobo = 0;
  const uniqueDrivers = new Set<string>();
  const spendByCostCenter = new Map<string, { spend: number; count: number }>();

  for (const b of bookingRows) {
    subtotalKobo += b.amountKobo;
    serviceFeeKobo += b.serviceFeeKobo;
    vatKobo += b.vatKobo;
    uniqueDrivers.add(b.driverUserId);
    const ccKey = b.costCenterId ?? 'unassigned';
    const curr = spendByCostCenter.get(ccKey) ?? { spend: 0, count: 0 };
    curr.spend += b.amountKobo + b.vatKobo;
    curr.count += 1;
    spendByCostCenter.set(ccKey, curr);
  }

  const allCostCenters = await db
    .select()
    .from(corporateCostCenters)
    .where(
      and(
        eq(corporateCostCenters.corporateId, corporateId),
        eq(corporateCostCenters.isActive, true),
      ),
    );

  const costCenterBreakdown: CorporateCostCenterSummary[] = [];

  for (const cc of allCostCenters) {
    const stats = spendByCostCenter.get(cc.id) ?? { spend: 0, count: 0 };
    costCenterBreakdown.push({
      costCenterId: cc.id,
      name: cc.name,
      code: cc.code,
      totalSpendKobo: stats.spend,
      bookingCount: stats.count,
      monthlyBudgetKobo: cc.monthlyBudgetKobo,
    });
    spendByCostCenter.delete(cc.id);
  }

  const unassigned = spendByCostCenter.get('unassigned');
  if (unassigned && unassigned.count > 0) {
    costCenterBreakdown.push({
      costCenterId: null,
      name: 'General / Unassigned',
      code: 'CC-GEN-00',
      totalSpendKobo: unassigned.spend,
      bookingCount: unassigned.count,
      monthlyBudgetKobo: null,
    });
  }

  const totalSpendKobo = subtotalKobo + vatKobo;

  return {
    billingPeriod: period,
    totalSpendKobo,
    subtotalKobo,
    serviceFeeKobo,
    vatKobo,
    totalBookings: bookingRows.length,
    activeDrivers: uniqueDrivers.size,
    costCenterBreakdown,
  };
}

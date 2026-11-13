import { lagosDateKey } from '@parkly/domain';
import type { AppDeps } from '../../app.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Doc 06 section 11: what a person is sent when they ask for their data. It
 * covers what we hold about them in a form they can read: their profile (the
 * phone is only its last four digits, as everywhere), vehicles, consents,
 * bookings with the payments and refunds on each. Internal ids that mean nothing
 * to them, other people's data and staff notes are left out.
 */
export async function buildDataExport(
  deps: Pick<AppDeps, 'store' | 'now'>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { store } = deps;
  const now = deps.now();
  const [user, vehicles, consents, upcoming, past, activePasses, pastPasses, verification] =
    await Promise.all([
      store.users.find(userId),
      store.vehicles.list(userId),
      store.consents.latest(userId),
      store.bookings.listForDriver(userId, 'upcoming', now, 500),
      store.bookings.listForDriver(userId, 'past', now, 500),
      store.passes.listForDriver(userId, 'active', lagosDateKey(now), 100),
      store.passes.listForDriver(userId, 'past', lagosDateKey(now), 100),
      store.driverVerifications.latest(userId),
    ]);

  const bookings = [];
  for (const b of [...upcoming, ...past]) {
    const [payments, refunds, lot] = await Promise.all([
      store.payments.listForBooking(b.id),
      store.payments.refundsForBooking(b.id),
      store.lots.findById(b.lotId),
    ]);
    bookings.push({
      code: b.code,
      carPark: lot?.name ?? null,
      status: b.status,
      start: iso(b.startAt),
      end: iso(b.endAt),
      plate: b.plateNorm,
      totalNaira: b.totalKobo / 100,
      bookedAt: iso(b.createdAt),
      payments: payments.map((p) => ({
        kind: p.kind ?? 'BOOKING',
        amountNaira: p.amountKobo / 100,
        status: p.status,
        paidAt: iso(p.paidAt),
      })),
      refunds: refunds.map((r) => ({
        amountNaira: r.amountKobo / 100,
        status: r.status,
        reason: r.reason,
      })),
    });
  }

  return {
    generatedAt: now.toISOString(),
    about:
      'A copy of the personal data Parkly holds about you. Money is in naira. Payment card details are held by Paystack, not Parkly.',
      profile: user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            phoneEndsWith: user.phoneLast4,
            marketingMessages: user.marketingOptIn,
            accountStatus: user.status,
            isVerifiedDriver: Boolean(user.isVerifiedDriver),
            verifiedAt: iso(user.verifiedAt),
          }
        : null,
      driverVerification: verification
        ? {
            method: verification.method,
            status: verification.status,
            idNumberMasked: verification.maskedIdNumber,
            verifiedAt: iso(verification.verifiedAt),
          }
        : null,
      vehicles: vehicles.map((v) => ({
        plate: v.plateRaw,
        make: v.make,
        model: v.model,
        colour: v.colour,
        isDefault: v.isDefault,
      })),
      consents: Object.entries(consents).map(([type, c]) => ({
        type,
        version: c?.version ?? null,
        granted: c?.granted ?? null,
      })),
      bookings,
      passes: [...activePasses, ...pastPasses].map((p) => ({
        code: p.code,
        status: p.status,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        plate: p.plateNorm,
        totalNaira: p.totalKobo / 100,
        swapsUsed: p.swapsUsed,
        createdAt: iso(p.createdAt),
      })),
    };
}

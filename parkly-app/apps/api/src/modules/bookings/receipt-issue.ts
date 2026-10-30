import type { BookingReceipt } from '@parkly/contracts';
import { lagosDateKey } from '@parkly/domain/time';
import type { AppDeps } from '../../app.js';
import type { BookingRow } from '../../store/types.js';
import { buildReceiptContent, receiptFromRow, type ReceiptContent } from './receipt.js';

/**
 * FR-BOOK-009, gap review L-5: the booking's stored receipt, issued or brought
 * up to date. The first issue freezes who issued it, where, for whom and the
 * VAT terms; later revisions change only money and status (charges, refunds,
 * times after an extension), so a renamed lot or a renewed permit never
 * rewrites an old receipt. Null until something has been paid.
 */
export async function issueReceipt(
  deps: Pick<AppDeps, 'store' | 'now'>,
  booking: BookingRow,
): Promise<{ receipt: BookingReceipt; changed: boolean } | null> {
  const { store } = deps;
  const now = deps.now();
  const lot = await store.lots.findById(booking.lotId);
  if (!lot) return null;
  const [existing, operator, permit, user, payments, refunds, vatOn, vatRate, vatNumber] =
    await Promise.all([
      store.receipts.find(booking.id),
      store.operators.find(lot.operatorId),
      store.permits.currentApproved(lot.id, lagosDateKey(now)),
      store.users.find(booking.driverId),
      store.payments.listForBooking(booking.id),
      store.payments.refundsForBooking(booking.id),
      store.settings.get<boolean>('fees.vat_enabled'),
      store.settings.get<number>('fees.vat_rate_bps'),
      store.settings.get<string | null>('company.vat_number'),
    ]);

  const before = existing?.content as ReceiptContent | undefined;
  const fresh = buildReceiptContent({
    booking,
    lot,
    issuerName: operator?.tradingName ?? lot.name,
    permitNumber: permit?.permitNumber ?? null,
    user,
    payments,
    refunds,
    vat: vatOn ? { rateBps: vatRate ?? 750, number: vatNumber ?? null } : null,
  });
  if (fresh.charges.length === 0) return null;

  // Identity is fixed at first issue; VAT keeps its first terms, recomputed on the money kept.
  const content: ReceiptContent = before
    ? {
        ...fresh,
        issuer: before.issuer,
        lot: before.lot,
        vehicle: before.vehicle,
        driver: before.driver,
        vat: before.vat
          ? (buildReceiptContent({
              booking,
              lot,
              issuerName: before.issuer.name,
              permitNumber: before.lot.permitNumber,
              user,
              payments,
              refunds,
              vat: { rateBps: before.vat.rateBps, number: before.vat.number },
            }).vat ?? null)
          : null,
      }
    : fresh;

  const row = await store.receipts.issue({
    bookingId: booking.id,
    operatorId: lot.operatorId,
    content,
    at: now,
  });
  return { receipt: receiptFromRow(row), changed: row.changed };
}

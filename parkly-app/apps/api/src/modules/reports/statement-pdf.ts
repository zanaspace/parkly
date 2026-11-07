import type { MonthlyStatement } from '@parkly/contracts';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const BRAND = rgb(0, 0.5, 0.5);
const MUTED = rgb(0.42, 0.45, 0.5);
const INK = rgb(0.07, 0.09, 0.15);

/** NGN, not ₦: the standard PDF fonts have no naira sign. */
const money = (kobo: number) =>
  `NGN ${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lagos = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * FR-OPS-006: Monthly statement of account as a PDF document.
 * Includes financial summary, car park breakdown, and provider settlement payouts.
 */
export async function renderStatementPdf(statement: MonthlyStatement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Parkly Statement ${statement.statementNumber}`);
  doc.setProducer('Parkly');
  doc.setCreationDate(new Date(statement.generatedAt));
  doc.setModificationDate(new Date(statement.generatedAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const printable = (font: PDFFont, text: string) =>
    [...text.normalize('NFKD').replace(/\p{M}/gu, '')]
      .map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return '?';
        }
      })
      .join('');

  const ensureSpace = (size: number) => {
    if (y < MARGIN + size + 20) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
  };

  const line = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    ensureSpace(size);
    page.drawText(printable(font, text), { x: MARGIN, y, size, font, color: opts.color ?? INK });
    y -= size + (opts.gap ?? 6);
  };

  const row = (label: string, value: string, font: PDFFont = regular, p: PDFPage = page) => {
    const size = 10;
    ensureSpace(size);
    const v = printable(font, value);
    p.drawText(printable(regular, label), { x: MARGIN, y, size, font: regular, color: INK });
    p.drawText(v, {
      x: A4.width - MARGIN - font.widthOfTextAtSize(v, size),
      y,
      size,
      font,
      color: INK,
    });
    y -= size + 6;
  };

  const divider = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4.width - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.9),
    });
    y -= 12;
  };

  const space = (h = 8) => {
    y -= h;
  };

  // Header
  line('Parkly', { font: bold, size: 20, color: BRAND, gap: 4 });
  line(`Monthly Statement of Account`, { font: bold, size: 14 });
  line(`Statement: ${statement.statementNumber}`, { color: MUTED });
  line(`Period: ${statement.periodStart} to ${statement.periodEnd} (Lagos)`, { color: MUTED });
  line(`Generated: ${lagos(statement.generatedAt)}`, { color: MUTED });
  space(10);
  divider();

  // Operator & Payout Details
  line('Operator Information', { font: bold, size: 11, gap: 4 });
  row('Business Legal Name', statement.operatorName);
  if (statement.payoutAccount) {
    row(
      'Payout Bank',
      `${statement.payoutAccount.bankName ?? 'Bank'} (ending in ${statement.payoutAccount.accountNumberLast4 ?? '****'})`,
    );
    if (statement.payoutAccount.accountName) {
      row('Account Name', statement.payoutAccount.accountName);
    }
  } else {
    row('Payout Bank', 'None / Not configured');
  }
  space(8);
  divider();

  // Financial Summary
  line('Financial Summary', { font: bold, size: 11, gap: 6 });
  row('Total Bookings Paid', String(statement.totals.bookingsCount));
  row('Paid by Drivers (after refunds)', money(statement.totals.grossBookingKobo));
  row('  of which Extensions', money(statement.totals.extensionKobo));
  row('  of which Overstay', money(statement.totals.overstayKobo));
  row('Refunded to Drivers', money(statement.totals.refundKobo));
  row('Platform Commission', money(statement.totals.commissionKobo));
  row('Driver Service Fees', money(statement.totals.serviceFeeKobo));
  row('Net Operator Earnings', money(statement.totals.netOperatorKobo), bold);
  row('Total Settled to Bank', money(statement.totals.settlementKobo));
  row('Closing Balance (Unsettled)', money(statement.totals.closingBalanceKobo), bold);
  space(8);
  divider();

  // Car Park Breakdown
  line('Breakdown by Car Park', { font: bold, size: 11, gap: 6 });
  if (statement.lots.length === 0) {
    line('No car park activity recorded in this period.', { color: MUTED });
  } else {
    for (const lot of statement.lots) {
      ensureSpace(24);
      line(lot.lotName, { font: bold, size: 10 });
      row(
        `  ${lot.bookingsCount} bookings · Gross ${money(lot.grossBookingKobo)} · Comm ${money(lot.commissionKobo)}`,
        `Net ${money(lot.netOperatorKobo)}`,
      );
    }
  }
  space(8);
  divider();

  // Settlement Payouts
  line('Provider Settlement Payouts', { font: bold, size: 11, gap: 6 });
  if (statement.settlements.length === 0) {
    line('No settlement payouts recorded in this period.', { color: MUTED });
  } else {
    for (const s of statement.settlements) {
      ensureSpace(18);
      const dateStr = s.settledAt ? lagos(s.settledAt) : 'Processing';
      row(`${dateStr} · Ref: ${s.providerSettlementId} (${s.status})`, money(s.amountKobo));
    }
  }
  space(14);
  divider();

  // Footer
  line('Parkly Technologies Ltd · support@parkly.ng · Lagos, Nigeria', {
    color: MUTED,
    size: 8,
  });

  return doc.save();
}

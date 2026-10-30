import type { BookingReceipt } from '@parkly/contracts';
import { includedVatKobo } from '@parkly/domain/booking';
import type { Quote as DomainQuote } from '@parkly/domain/pricing';
import type {
  BookingRow,
  LotRow,
  PaymentRow,
  ReceiptRow,
  RefundRow,
  UserRow,
} from '../../store/types.js';
import { toPublicQuote } from '../discovery/routes.js';

function quoteLineLabel(line: BookingReceipt['lines'][number]): string {
  switch (line.kind) {
    case 'HOURLY_DAY':
      return `Hourly Parking (${line.minutes}m${line.capped ? ', daily capped' : ''})`;
    case 'DAY':
      return `Daily Parking (${line.date})`;
    case 'MONTH':
      return `Monthly Pass (${line.periodStart} to ${line.periodEnd})`;
    case 'SERVICE_FEE':
      return 'Service / Platform Fee';
  }
}

function formatNaira(kobo: number): string {
  const naira = (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₦${naira}`;
}

function formatLagosDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Everything a receipt shows except its number, revision and dates (frozen when issued). */
export type ReceiptContent = Omit<
  BookingReceipt,
  'receiptNumber' | 'revision' | 'issuedAt' | 'revisedAt'
>;

/** A charge that brought money in; failed and abandoned checkouts are not on the receipt. */
const PAID = new Set<PaymentRow['status']>(['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED']);

/**
 * FR-BOOK-009: what the receipt says, from the booking's records. Charges add
 * up to the total; refunds are split into done and still in progress; VAT
 * (included in prices) is shown only when switched on.
 */
export function buildReceiptContent(params: {
  booking: BookingRow;
  lot: Pick<LotRow, 'id' | 'name' | 'addressLine' | 'area'>;
  issuerName: string;
  permitNumber: string | null;
  user: UserRow | null;
  payments: PaymentRow[];
  refunds: RefundRow[];
  vat: { rateBps: number; number: string | null } | null;
}): ReceiptContent {
  const { booking, lot, user, payments, refunds } = params;
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));

  const lines: BookingReceipt['lines'] = Array.isArray(booking.pricingBreakdown)
    ? toPublicQuote({
        product: booking.product,
        priceKobo: booking.priceKobo,
        serviceFeeKobo: booking.serviceFeeKobo,
        totalKobo: booking.totalKobo,
        commissionKobo: 0,
        operatorAmountKobo: 0,
        lines: booking.pricingBreakdown as DomainQuote['lines'],
      }).lines
    : [
        {
          kind: 'HOURLY_DAY' as const,
          date: booking.startAt.toISOString().slice(0, 10),
          minutes: durationMinutes,
          amountKobo: booking.priceKobo,
          capped: false,
        },
        ...(booking.serviceFeeKobo > 0
          ? [
              {
                kind: 'SERVICE_FEE' as const,
                amountKobo: booking.serviceFeeKobo,
              },
            ]
          : []),
      ];

  const charges = payments
    .filter((p) => PAID.has(p.status))
    .map((p) => ({
      kind: (p.kind ?? 'BOOKING') as BookingReceipt['charges'][number]['kind'],
      reference: p.id,
      amountKobo: p.amountKobo,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    }));
  const sum = (xs: { amountKobo: number }[]) => xs.reduce((n, x) => n + x.amountKobo, 0);
  const chargedKobo = sum(charges);
  const refundedKobo = sum(refunds.filter((r) => r.status === 'SUCCEEDED'));
  const refundPendingKobo = sum(refunds.filter((r) => r.status === 'PENDING'));

  return {
    bookingId: booking.id,
    bookingCode: booking.code,
    status: booking.status,
    issuer: { name: params.issuerName },
    lot: {
      id: lot.id,
      name: lot.name,
      addressLine: lot.addressLine,
      area: lot.area,
      permitNumber: params.permitNumber,
    },
    vehicle: {
      plate: booking.plateNorm,
    },
    driver: {
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      phoneLast4: user?.phoneLast4 ?? null,
    },
    product: booking.product,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    durationMinutes,
    priceKobo: booking.priceKobo,
    serviceFeeKobo: booking.serviceFeeKobo,
    totalKobo: booking.totalKobo,
    lines,
    charges,
    totals: { chargedKobo, refundedKobo, refundPendingKobo },
    vat: params.vat
      ? {
          rateBps: params.vat.rateBps,
          // On what was finally kept: refunds give their VAT back.
          amountKobo: includedVatKobo(chargedKobo - refundedKobo, params.vat.rateBps),
          number: params.vat.number,
        }
      : null,
    payments: payments.map((p) => ({
      reference: p.id,
      kind: (p.kind ?? 'BOOKING') as BookingReceipt['payments'][number]['kind'],
      amountKobo: p.amountKobo,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      channel: p.channel ?? null,
      cardLast4: p.cardLast4 ?? null,
      status: p.status,
    })),
    refunds: refunds.map((r) => ({
      amountKobo: r.amountKobo,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** The stored receipt: frozen content plus its number, revision and dates. */
export function receiptFromRow(row: ReceiptRow): BookingReceipt {
  return {
    ...(row.content as ReceiptContent),
    receiptNumber: row.number,
    revision: row.revision,
    issuedAt: row.issuedAt.toISOString(),
    revisedAt: row.revisedAt.toISOString(),
  };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes every string in the receipt: lot names, addresses and plates are typed by people. */
function escapeStrings<T>(value: T): T {
  if (typeof value === 'string')
    return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch) as T;
  if (Array.isArray(value)) return value.map(escapeStrings) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeStrings(v)])) as T;
  return value;
}

/** The receipt as a standalone page; every value is HTML-escaped (gap review S-3). */
export function renderReceiptHtml(receipt: BookingReceipt): string {
  return renderEscaped(escapeStrings(receipt));
}

/** Content-Security-Policy for the receipt page: its own inline styles, nothing else. */
export const RECEIPT_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";

function renderEscaped(receipt: BookingReceipt): string {
  const startStr = formatLagosDateTime(receipt.startAt);
  const endStr = formatLagosDateTime(receipt.endAt);
  const issuedStr = formatLagosDateTime(receipt.issuedAt);

  const hours = Math.floor(receipt.durationMinutes / 60);
  const mins = receipt.durationMinutes % 60;
  const durationStr =
    `${hours > 0 ? `${hours} hr${hours > 1 ? 's' : ''} ` : ''}${mins > 0 ? `${mins} min${mins > 1 ? 's' : ''}` : ''}`.trim() ||
    '0 mins';

  const driverName =
    [receipt.driver.firstName, receipt.driver.lastName].filter(Boolean).join(' ') ||
    'Parkly Driver';

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    CONFIRMED: { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
    COMPLETED: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
    CHECKED_IN: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    CANCELLED: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
    NO_SHOW: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    EXPIRED: { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
    PENDING_PAYMENT: { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  };

  const statusBadge = statusColors[receipt.status] ?? {
    bg: '#f3f4f6',
    text: '#374151',
    border: '#e5e7eb',
  };

  const paymentItemsHtml = receipt.payments
    .map(
      (p: BookingReceipt['payments'][number]) => `
      <div class="payment-row">
        <div class="payment-info">
          <span class="payment-kind">${p.kind} PAYMENT</span>
          <span class="payment-ref">Ref: ${p.reference}</span>
          ${p.cardLast4 ? `<span class="payment-card">${p.channel ?? 'Card'} •••• ${p.cardLast4}</span>` : p.channel ? `<span class="payment-card">${p.channel}</span>` : ''}
          ${p.paidAt ? `<span class="payment-date">${formatLagosDateTime(p.paidAt)}</span>` : ''}
        </div>
        <div class="payment-amount ${p.status === 'SUCCEEDED' ? 'paid' : 'pending'}">
          ${formatNaira(p.amountKobo)}
          <span class="payment-status">${p.status}</span>
        </div>
      </div>
    `,
    )
    .join('');

  // One row per charge after the booking: extensions and overstay (gap review L-5).
  const CHARGE_LABEL: Record<BookingReceipt['charges'][number]['kind'], string> = {
    BOOKING: 'Booking',
    EXTENSION: 'Extension',
    OVERSTAY: 'Overstay',
    PASS: 'Pass',
  };
  const chargesHtml =
    receipt.charges.length > 1
      ? `<table class="breakdown-table"><tbody>${receipt.charges
          .map(
            (ch) =>
              `<tr><td>${CHARGE_LABEL[ch.kind]}${ch.paidAt ? ` · ${formatLagosDateTime(ch.paidAt)}` : ''}</td><td style="text-align: right;">${formatNaira(ch.amountKobo)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '';

  const refundItemsHtml = receipt.refunds.length
    ? receipt.refunds
        .map(
          (r: BookingReceipt['refunds'][number]) => `
        <div class="refund-row">
          <div>
            <span class="refund-label">${r.status === 'SUCCEEDED' ? 'Refunded' : r.status === 'PENDING' ? 'Refund in progress' : 'Refund failed, retrying'} (${r.reason})</span>
            <span class="refund-date">${formatLagosDateTime(r.createdAt)}</span>
          </div>
          <div class="refund-amount">-${formatNaira(r.amountKobo)}</div>
        </div>
      `,
        )
        .join('')
    : '';

  const quoteLinesHtml = receipt.lines
    .map(
      (l: BookingReceipt['lines'][number]) => `
      <tr>
        <td class="line-label">${quoteLineLabel(l)}</td>
        <td class="line-amount">${formatNaira(l.amountKobo)}</td>
      </tr>
    `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${receipt.bookingCode} | Parkly</title>
  <style>
    :root {
      --primary: #008080;
      --primary-dark: #006666;
      --text: #111827;
      --text-muted: #6b7280;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --border-light: #f1f5f9;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      display: flex;
      justify-content: center;
      min-height: 100vh;
    }
    .receipt-container {
      background: var(--card-bg);
      max-width: 680px;
      width: 100%;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
      border: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: linear-gradient(135deg, #008080 0%, #005555 100%);
      color: #ffffff;
      padding: 32px 32px 28px;
      position: relative;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-mark {
      background: #ffffff;
      color: #008080;
      font-weight: 800;
      font-size: 20px;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: -0.5px;
    }
    .brand-name {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .brand-tagline {
      font-size: 11px;
      opacity: 0.8;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .status-badge {
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 9999px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border: 1px solid ${statusBadge.border};
      background-color: ${statusBadge.bg};
      color: ${statusBadge.text};
    }
    .header-details {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .receipt-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      opacity: 0.85;
      margin-bottom: 4px;
    }
    .booking-code {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 1px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .issued-date {
      font-size: 12px;
      opacity: 0.8;
      text-align: right;
    }
    .content {
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
    }
    .card-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .card-value {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
    }
    .plate-badge {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 17px;
      font-weight: 700;
      background: #ffffff;
      border: 2px solid var(--text);
      padding: 4px 12px;
      border-radius: 6px;
      letter-spacing: 2px;
      margin-top: 6px;
    }
    .schedule-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
    }
    .schedule-time {
      display: flex;
      flex-direction: column;
    }
    .schedule-divider {
      font-size: 20px;
      color: var(--primary);
      opacity: 0.6;
    }
    .duration-pill {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      background: #e6f4f4;
      color: var(--primary-dark);
      padding: 3px 8px;
      border-radius: 6px;
      margin-top: 6px;
      width: fit-content;
    }
    .breakdown-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .breakdown-table tr {
      border-bottom: 1px solid var(--border-light);
    }
    .breakdown-table td {
      padding: 12px 0;
      font-size: 15px;
    }
    .line-label {
      color: var(--text);
      font-weight: 500;
    }
    .line-amount {
      text-align: right;
      font-weight: 600;
      color: var(--text);
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 18px;
      margin-top: 8px;
      border-top: 2px solid var(--border);
    }
    .total-label {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
    }
    .total-amount {
      font-size: 26px;
      font-weight: 800;
      color: var(--primary-dark);
    }
    .payment-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg);
      border-radius: 8px;
      border: 1px solid var(--border);
      margin-top: 8px;
    }
    .payment-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .payment-kind {
      font-size: 11px;
      font-weight: 700;
      color: var(--primary-dark);
      letter-spacing: 0.5px;
    }
    .payment-ref {
      font-size: 12px;
      font-family: monospace;
      color: var(--text-muted);
    }
    .payment-card, .payment-date {
      font-size: 12px;
      color: var(--text-muted);
    }
    .payment-amount {
      text-align: right;
      font-size: 15px;
      font-weight: 700;
    }
    .payment-amount.paid {
      color: #065f46;
    }
    .payment-amount.pending {
      color: #9a3412;
    }
    .payment-status {
      display: block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      opacity: 0.8;
    }
    .refund-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #fef2f2;
      border-radius: 8px;
      border: 1px solid #fecaca;
      margin-top: 8px;
    }
    .refund-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #991b1b;
    }
    .refund-date {
      font-size: 11px;
      color: #b91c1c;
    }
    .refund-amount {
      font-size: 15px;
      font-weight: 700;
      color: #991b1b;
    }
    .actions {
      padding: 24px 32px 32px;
      border-top: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafafa;
    }
    .print-btn {
      background: var(--primary);
      color: #ffffff;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background-color 0.15s ease;
    }
    .print-btn:hover {
      background: var(--primary-dark);
    }
    .footer-note {
      font-size: 12px;
      color: var(--text-muted);
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .receipt-container {
        border: none;
        box-shadow: none;
        max-width: 100%;
        width: 100%;
      }
      .actions {
        display: none !important;
      }
      .header {
        background: #008080 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    @media (max-width: 600px) {
      body {
        padding: 12px;
      }
      .content {
        padding: 20px;
      }
      .grid-2 {
        grid-template-columns: 1fr;
      }
      .schedule-box {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .schedule-divider {
        display: none;
      }
      .actions {
        flex-direction: column;
        gap: 16px;
        align-items: stretch;
      }
      .print-btn {
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <header class="header">
      <div class="header-top">
        <div class="brand">
          <div class="logo-mark">P</div>
          <div>
            <div class="brand-name">Parkly</div>
            <div class="brand-tagline">Smart Cashless Parking</div>
          </div>
        </div>
        <div class="status-badge">${receipt.status}</div>
      </div>
      <div class="header-details">
        <div>
          <div class="receipt-title">Official Parking Receipt · ${receipt.receiptNumber}</div>
          <div class="booking-code">${receipt.bookingCode}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Issued by ${receipt.issuer.name} through Parkly</div>
        </div>
        <div class="issued-date">
          <div>Issued</div>
          <div>${issuedStr}</div>
          ${receipt.revision > 1 ? `<div style="margin-top: 4px;">Revision ${receipt.revision}, ${formatLagosDateTime(receipt.revisedAt)}</div>` : ''}
        </div>
      </div>
    </header>

    <main class="content">
      <div class="grid-2">
        <div class="card">
          <div class="card-label">Parking Location</div>
          <div class="card-value">${receipt.lot.name}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">
            ${receipt.lot.addressLine}${receipt.lot.area ? `, ${receipt.lot.area}` : ''}
          </div>
          ${receipt.lot.permitNumber ? `<div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">LASPA permit ${receipt.lot.permitNumber}</div>` : ''}
        </div>

        <div class="card">
          <div class="card-label">Vehicle & Driver</div>
          <div class="plate-badge">${receipt.vehicle.plate}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">
            ${driverName}${receipt.driver.phoneLast4 ? ` (•••• ${receipt.driver.phoneLast4})` : ''}
          </div>
        </div>
      </div>

      <div>
        <div class="section-title">Parking Window</div>
        <div class="schedule-box">
          <div class="schedule-time">
            <span class="card-label">Entry From</span>
            <span class="card-value">${startStr}</span>
          </div>
          <div class="schedule-divider">→</div>
          <div class="schedule-time">
            <span class="card-label">Exit By</span>
            <span class="card-value">${endStr}</span>
            <span class="duration-pill">${durationStr}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="section-title">Itemized Charges</div>
        <table class="breakdown-table">
          <tbody>
            ${quoteLinesHtml}
          </tbody>
        </table>

        ${chargesHtml}
        <div class="total-row">
          <div class="total-label">Total Charged</div>
          <div class="total-amount">${formatNaira(receipt.totals.chargedKobo)}</div>
        </div>
        ${receipt.totals.refundedKobo > 0 ? `<div class="total-row"><div class="total-label">Refunded</div><div class="total-amount">-${formatNaira(receipt.totals.refundedKobo)}</div></div>` : ''}
        ${receipt.totals.refundPendingKobo > 0 ? `<div class="total-row"><div class="total-label">Refund in progress</div><div class="total-amount">-${formatNaira(receipt.totals.refundPendingKobo)}</div></div>` : ''}
        ${receipt.vat ? `<div style="font-size: 13px; color: var(--text-muted); padding-top: 6px;">Includes VAT at ${receipt.vat.rateBps / 100}%: ${formatNaira(receipt.vat.amountKobo)}${receipt.vat.number ? ` · VAT no. ${receipt.vat.number}` : ''}</div>` : ''}
      </div>

      <div>
        <div class="section-title">Payment History</div>
        ${paymentItemsHtml || '<div style="font-size: 13px; color: var(--text-muted); padding: 8px 0;">No payments recorded</div>'}
        ${refundItemsHtml}
      </div>
    </main>

    <footer class="actions">
      <div class="footer-note">
        <div>Questions? Email <strong>support@parkly.ng</strong></div>
        <div>Parkly Technologies Ltd • Lagos, Nigeria</div>
      </div>
      <button class="print-btn" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save PDF
      </button>
    </footer>
  </div>
</body>
</html>`;
}

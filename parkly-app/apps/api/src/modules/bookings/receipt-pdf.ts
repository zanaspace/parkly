import type { BookingReceipt } from '@parkly/contracts';
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

const CHARGE: Record<BookingReceipt['charges'][number]['kind'], string> = {
  BOOKING: 'Booking',
  EXTENSION: 'Extension',
  OVERSTAY: 'Overstay',
  PASS: 'Pass',
};

/**
 * FR-BOOK-009: the receipt as a PDF, drawn from the stored (frozen) receipt,
 * so every copy of a revision is the same. Generated on demand (doc 06).
 */
export async function renderReceiptPdf(receipt: BookingReceipt): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Parkly receipt ${receipt.receiptNumber}`);
  doc.setProducer('Parkly');
  doc.setCreationDate(new Date(receipt.revisedAt));
  doc.setModificationDate(new Date(receipt.revisedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  /** Keeps what the font can draw; names with other letters still print. */
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

  const line = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    if (y < MARGIN + size) {
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - MARGIN;
    }
    page.drawText(printable(font, text), { x: MARGIN, y, size, font, color: opts.color ?? INK });
    y -= size + (opts.gap ?? 6);
  };
  const row = (label: string, value: string, font: PDFFont = regular, p: PDFPage = page) => {
    const size = 10;
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
  const space = (h = 8) => {
    y -= h;
  };

  line('Parkly', { font: bold, size: 20, color: BRAND, gap: 4 });
  line(`Official parking receipt ${receipt.receiptNumber}`, { font: bold, size: 13 });
  line(`Issued by ${receipt.issuer.name} through Parkly`, { color: MUTED });
  line(
    `Issued ${lagos(receipt.issuedAt)}${receipt.revision > 1 ? ` · revision ${receipt.revision}, ${lagos(receipt.revisedAt)}` : ''}`,
    { color: MUTED },
  );
  space();

  line(`Booking ${receipt.bookingCode} · ${receipt.status.replace('_', ' ')}`, { font: bold });
  line(receipt.lot.name);
  line(`${receipt.lot.addressLine}${receipt.lot.area ? `, ${receipt.lot.area}` : ''}`, {
    color: MUTED,
  });
  if (receipt.lot.permitNumber) line(`LASPA permit ${receipt.lot.permitNumber}`, { color: MUTED });
  line(`Vehicle ${receipt.vehicle.plate}`);
  line(`${lagos(receipt.startAt)} to ${lagos(receipt.endAt)}`);
  space();

  line('Charges', { font: bold, size: 11 });
  for (const ch of receipt.charges)
    row(
      `${CHARGE[ch.kind]}${ch.paidAt ? ` · ${lagos(ch.paidAt)}` : ''} · ${ch.reference}`,
      money(ch.amountKobo),
    );
  space(2);
  row('Total charged', money(receipt.totals.chargedKobo), bold);
  if (receipt.totals.refundedKobo > 0) row('Refunded', `-${money(receipt.totals.refundedKobo)}`);
  if (receipt.totals.refundPendingKobo > 0)
    row('Refund in progress', `-${money(receipt.totals.refundPendingKobo)}`);
  if (receipt.vat)
    line(
      `Includes VAT at ${receipt.vat.rateBps / 100}%: ${money(receipt.vat.amountKobo)}${receipt.vat.number ? ` · VAT no. ${receipt.vat.number}` : ''}`,
      { color: MUTED },
    );
  space(16);
  line('Questions? support@parkly.ng · Parkly Technologies Ltd, Lagos, Nigeria', {
    size: 9,
    color: MUTED,
  });

  return doc.save();
}

import type { SupportSearchResponse } from '@parkly/contracts';

const KIND: Record<SupportSearchResponse['kind'], string> = {
  CODE: 'Booking code',
  REFERENCE: 'Payment reference',
  PHONE: 'Phone number',
  PLATE: 'Plate',
  INVALID: '',
};

/** "Phone number: 2 bookings", so support knows how the box read what they typed. */
export function resultSummary(kind: SupportSearchResponse['kind'], count: number): string {
  if (kind === 'INVALID')
    return 'Type a booking code (PK-3MV7BU), a phone number, a plate or a payment reference.';
  const n = count === 0 ? 'no bookings' : count === 1 ? '1 booking' : `${count} bookings`;
  return `${KIND[kind]}: ${n}${count === 20 ? ' (the 20 newest)' : ''}`;
}

/** Lagos date and time, e.g. "19 Oct, 10:00". */
export function lagosShort(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  });
}

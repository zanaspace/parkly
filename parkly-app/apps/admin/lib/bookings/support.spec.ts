import { describe, expect, it } from 'vitest';
import { lagosShort, resultSummary } from './support';

describe('support search wording', () => {
  it('says how the query was read and how many matched', () => {
    expect(resultSummary('PHONE', 2)).toBe('Phone number: 2 bookings');
    expect(resultSummary('CODE', 1)).toBe('Booking code: 1 booking');
    expect(resultSummary('PLATE', 0)).toBe('Plate: no bookings');
    expect(resultSummary('REFERENCE', 20)).toBe('Payment reference: 20 bookings (the 20 newest)');
    expect(resultSummary('INVALID', 0)).toContain('Type a booking code');
  });

  it('shows Lagos time', () => {
    expect(lagosShort('2026-10-19T09:00:00.000Z')).toBe('19 Oct, 10:00');
  });
});

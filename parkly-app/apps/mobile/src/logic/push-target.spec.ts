import { describe, expect, it } from 'vitest';
import { pushTarget } from './push-target';

describe('where a tapped notification opens', () => {
  it('opens the booking it is about', () => {
    expect(pushTarget({ bookingId: 'b-1', key: 'booking.confirmed' })).toBe('/booking/b-1');
    // The link in the message may say /bookings/…; the booking id decides.
    expect(pushTarget({ bookingId: 'b-1', url: 'parkly://bookings/b-1/extend' })).toBe(
      '/booking/b-1',
    );
  });

  it('opens nothing for data it does not recognise', () => {
    expect(pushTarget(undefined)).toBeNull();
    expect(pushTarget({ url: 'https://evil.example' })).toBeNull();
    expect(pushTarget({ bookingId: '../account' })).toBeNull();
  });
});

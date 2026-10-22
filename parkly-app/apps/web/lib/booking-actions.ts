'use server';

import type { CreateBookingResponse, Vehicle } from '@parkly/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiAs, ApiProblem } from './api';
import { requireDriver } from './session';

export type BookState = { error?: string } | undefined;

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

const MESSAGES: Record<string, string> = {
  BOOKING_SLOT_UNAVAILABLE: 'Sorry, that time just filled up. Try another time or car park.',
  BOOKING_OVERLAP_SAME_VEHICLE: 'This car already has a booking at that time. See My bookings.',
  BOOKING_WINDOW_INVALID: 'Pick a start time from now up to 30 days ahead, for at most 24 hours.',
  BOOKING_OUTSIDE_OPENING_HOURS: 'The car park is closed for part of that time.',
  LOT_NOT_BOOKABLE: 'This car park can’t take bookings for that right now.',
  PAYMENT_PROVIDER_UNAVAILABLE:
    'Payments aren’t reachable right now. Nothing was charged. Please try again.',
  IDEMPOTENCY_IN_PROGRESS: 'We’re still working on your booking. One moment, then try again.',
  PLATE_INVALID: 'That doesn’t look like a plate number. Check it and try again.',
  VEHICLE_DUPLICATE: 'This plate is already on your account.',
};
const message = (err: unknown) =>
  (err instanceof ApiProblem && MESSAGES[err.code]) || 'Something went wrong. Please try again.';

/** Where Paystack brings the driver back; the API accepts only our own origins. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** D-15 "Pay ₦X": hold the space, then hand over to Paystack's checkout page. */
export async function startBooking(_prev: BookState, form: FormData): Promise<BookState> {
  const back = field(form, 'back');
  const driver = await requireDriver(back.startsWith('/') ? back : '/bookings');
  const vehicleId = field(form, 'vehicleId');
  if (!vehicleId) return { error: 'Pick the car you’re parking.' };
  let created: CreateBookingResponse;
  try {
    created = await apiAs<CreateBookingResponse>(driver.accessToken, '/v1/bookings', {
      method: 'POST',
      // One key per page and car: a double click is the same booking, a new car is a new one.
      headers: { 'idempotency-key': `${field(form, 'key')}-${vehicleId.slice(0, 8)}` },
      body: {
        lotId: field(form, 'lotId'),
        vehicleId,
        product: field(form, 'product') === 'DAILY' ? 'DAILY' : 'HOURLY',
        startAt: field(form, 'startAt'),
        endAt: field(form, 'endAt'),
        source: 'WEB',
        returnTo: `${await siteOrigin()}/bookings/paid`,
      },
    });
  } catch (err) {
    return { error: message(err) };
  }
  if (!created.payment.authorizationUrl) return { error: message(null) };
  redirect(created.payment.authorizationUrl);
}

/** No car yet: add one here, without leaving checkout. */
export async function addCar(_prev: BookState, form: FormData): Promise<BookState> {
  const back = field(form, 'back');
  const driver = await requireDriver(back);
  try {
    await apiAs<Vehicle>(driver.accessToken, '/v1/me/vehicles', {
      method: 'POST',
      body: { plate: field(form, 'plate'), isDefault: true },
    });
  } catch (err) {
    return { error: message(err) };
  }
  redirect(back.startsWith('/') ? back : '/bookings');
}

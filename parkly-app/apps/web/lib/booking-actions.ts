'use server';

import type {
  CancelBookingResponse,
  CreateBookingResponse,
  ExtendBookingResponse,
  ExtensionOptions,
  OverstayPayResponse,
  Vehicle,
} from '@parkly/contracts';
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
  BOOKING_NOT_FOUND: 'Booking could not be found.',
  BOOKING_ALREADY_CANCELLED: 'This booking has already been cancelled.',
  BOOKING_NOT_CANCELLABLE: 'Only active un-checked-in bookings can be cancelled.',
  BOOKING_NOT_EXTENDABLE: 'This booking cannot be extended right now.',
  NO_OVERSTAY_DUE: 'No overstay payment is due for this booking.',
  OVERSTAY_UNPAID: 'Pay your unpaid overstay (see My bookings) before booking again.',
};
const message = (err: unknown) =>
  err instanceof ApiProblem
    ? err.detail || MESSAGES[err.code] || 'Something went wrong. Please try again.'
    : 'Something went wrong. Please try again.';

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

export type SelfCheckResult = { ok: boolean; message?: string };

const SELF_MESSAGES: Record<string, string> = {
  SELF_CHECKIN_OFF: 'Self check-in is not active for this car park.',
  QR_WRONG_LOT: 'That code does not match this car park. Scan the barrier or attendant QR.',
  SELF_CHECKIN_TOO_FAR: 'You must be physically at the car park (within 150 m) to check in or out.',
  QR_OUTSIDE_WINDOW: 'You can only check in up to 30 minutes before your booked start time.',
  BOOKING_NOT_ACTIVE: 'This booking is not currently active.',
  NOT_FOUND: 'Booking not found.',
};

/** Driver self check-in / check-out by scanning barrier poster or attendant barcode. */
export async function submitSelfCheck(
  bookingId: string,
  kind: 'in' | 'out',
  payload: { clientEventId: string; code: string; lat: number; lng: number },
): Promise<SelfCheckResult> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    await apiAs(driver.accessToken, `/v1/bookings/${bookingId}/self-check-${kind}`, {
      method: 'POST',
      body: payload,
    });
    return { ok: true };
  } catch (err) {
    const msg = (err instanceof ApiProblem && SELF_MESSAGES[err.code]) || message(err);
    return { ok: false, message: msg };
  }
}

export type ExtendBookingResult = {
  ok: boolean;
  message?: string;
  authorizationUrl?: string | null;
};

/** Loads current extension limits and closing time for an active booking. */
export async function getExtensionOptions(bookingId: string): Promise<ExtensionOptions | null> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    return await apiAs<ExtensionOptions>(
      driver.accessToken,
      `/v1/bookings/${encodeURIComponent(bookingId)}/extensions/options`,
    );
  } catch {
    return null;
  }
}

/** Extends an active booking by adding minutes on the 15-minute grid. */
export async function extendBooking(
  bookingId: string,
  newEndAt: string,
): Promise<ExtendBookingResult> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    const origin = await siteOrigin();
    const response = await apiAs<ExtendBookingResponse>(
      driver.accessToken,
      `/v1/bookings/${encodeURIComponent(bookingId)}/extensions`,
      {
        method: 'POST',
        headers: {
          // Same key for a double submit within the minute; a later retry gets a fresh checkout.
          'idempotency-key': `ext-${bookingId}-${new Date(newEndAt).getTime()}-${minuteBucket()}`,
        },
        body: {
          newEndAt,
          returnTo: `${origin}/bookings/${bookingId}`,
        },
      },
    );
    return {
      ok: true,
      authorizationUrl: response.payment?.authorizationUrl ?? null,
    };
  } catch (err) {
    const msg = err instanceof ApiProblem ? MESSAGES[err.code] || message(err) : message(err);
    return { ok: false, message: msg };
  }
}

export type CancelBookingResult = {
  ok: boolean;
  message?: string;
  refundKobo?: number;
  isFreeCancellation?: boolean;
};

/** Cancels a confirmed booking and initiates refund if eligible. */
export async function cancelBooking(
  bookingId: string,
  reason?: string,
): Promise<CancelBookingResult> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    const response = await apiAs<CancelBookingResponse>(
      driver.accessToken,
      `/v1/bookings/${encodeURIComponent(bookingId)}/cancel`,
      {
        method: 'POST',
        headers: {
          'idempotency-key': `can-${bookingId}`,
        },
        body: {
          reason: reason || 'CUSTOMER_REQUEST',
        },
      },
    );
    return {
      ok: true,
      refundKobo: response.refundKobo,
      isFreeCancellation: response.isFreeCancellation,
    };
  } catch (err) {
    const msg = err instanceof ApiProblem ? MESSAGES[err.code] || message(err) : message(err);
    return { ok: false, message: msg };
  }
}

export type PayOverstayResult = {
  ok: boolean;
  message?: string;
  authorizationUrl?: string | null;
};

/** Initiates checkout for unpaid overstay fees. */
export async function payOverstay(bookingId: string): Promise<PayOverstayResult> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    const origin = await siteOrigin();
    const response = await apiAs<OverstayPayResponse>(
      driver.accessToken,
      `/v1/bookings/${encodeURIComponent(bookingId)}/overstay/pay`,
      {
        method: 'POST',
        headers: {
          'idempotency-key': `ovr-${bookingId}-${minuteBucket()}`,
        },
        body: {
          returnTo: `${origin}/bookings/${bookingId}`,
        },
      },
    );
    return {
      ok: true,
      authorizationUrl: response.payment?.authorizationUrl ?? null,
    };
  } catch (err) {
    const msg = err instanceof ApiProblem ? MESSAGES[err.code] || message(err) : message(err);
    return { ok: false, message: msg };
  }
}

function minuteBucket() {
  return Math.floor(Date.now() / 60_000);
}

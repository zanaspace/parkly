'use server';

import type {
  CancelBookingResponse,
  CreateBookingResponse,
  CreatePassResponse,
  DriverVerification,
  EarlyStartOption,
  ExtendBookingResponse,
  ExtensionOptions,
  OverstayPayResponse,
  Pass,
  PassWaitlistResponse,
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
  DRIVER_VERIFICATION_REQUIRED:
    'This car park requires a Verified Driver badge. Complete the 60-second ID check to continue.',
  IDENTITY_VERIFICATION_FAILED:
    'We could not verify that ID number and date of birth. Please double-check your details.',
  PASS_SWAP_LIMIT_REACHED: 'You have already used all 2 vehicle swaps for this monthly pass.',
  PASS_NOT_ACTIVE: 'Only active monthly passes can swap vehicles.',
  BOOKING_LOT_FULL: 'Monthly pass capacity for this car park is full. Join the waitlist below.',
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

export type SelfCheckResult = { ok: boolean; message?: string; code?: string };

const SELF_MESSAGES: Record<string, string> = {
  SELF_CHECKIN_OFF: 'Self check-in is not active for this car park.',
  QR_WRONG_LOT: 'That code does not match this car park. Scan the barrier or attendant QR.',
  SELF_CHECKIN_TOO_FAR: 'You must be physically at the car park (within 150 m) to check in or out.',
  QR_OUTSIDE_WINDOW: 'It’s outside this booking’s check-in time.',
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
    return { ok: false, message: msg, ...(err instanceof ApiProblem ? { code: err.code } : {}) };
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

/** ADR 0023: whether this early driver can start now, and the server's price. */
export async function getEarlyStart(bookingId: string): Promise<EarlyStartOption | null> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    return await apiAs<EarlyStartOption>(
      driver.accessToken,
      `/v1/bookings/${encodeURIComponent(bookingId)}/early-start`,
    );
  } catch {
    return null;
  }
}

/** ADR 0023: pay to start at `newStartAt` (from the option); returns where to pay. */
export async function startEarly(
  bookingId: string,
  newStartAt: string,
): Promise<ExtendBookingResult> {
  const driver = await requireDriver(`/bookings/${bookingId}`);
  try {
    const origin = await siteOrigin();
    const response = await apiAs<ExtendBookingResponse>(
      driver.accessToken,
      `/v1/bookings/${encodeURIComponent(bookingId)}/early-start`,
      {
        method: 'POST',
        headers: {
          'idempotency-key': `early-${bookingId}-${new Date(newStartAt).getTime()}-${minuteBucket()}`,
        },
        body: { newStartAt, returnTo: `${origin}/bookings/${bookingId}` },
      },
    );
    return { ok: true, authorizationUrl: response.payment?.authorizationUrl ?? null };
  } catch (err) {
    const code = err instanceof ApiProblem ? err.code : null;
    const msg =
      code === 'BOOKING_WINDOW_INVALID'
        ? 'The early start time has just changed. Check the new price and try again.'
        : code === 'BOOKING_SLOT_UNAVAILABLE'
          ? 'Sorry, there’s no free space for the earlier time any more.'
          : err instanceof ApiProblem
            ? MESSAGES[err.code] || message(err)
            : message(err);
    return { ok: false, message: msg };
  }
}

// --- Sprint 9: Monthly passes & Driver Identity Verification (FR-PASS-001…005, FR-AUTH-009) ---

export async function startPass(_prev: BookState, form: FormData): Promise<BookState> {
  const back = field(form, 'back') || '/passes';
  const driver = await requireDriver(back);
  const vehicleId = field(form, 'vehicleId');
  const lotId = field(form, 'lotId');
  const startDate = field(form, 'startDate');
  if (!vehicleId) return { error: 'Pick the car for your monthly pass.' };
  let created: CreatePassResponse;
  try {
    created = await apiAs<CreatePassResponse>(driver.accessToken, '/v1/passes', {
      method: 'POST',
      headers: { 'idempotency-key': `${field(form, 'key')}-${vehicleId.slice(0, 8)}` },
      body: {
        lotId,
        vehicleId,
        startDate,
        source: 'WEB',
        returnTo: `${await siteOrigin()}/passes`,
      },
    });
  } catch (err) {
    return { error: message(err) };
  }
  if (created.payment.authorizationUrl) {
    redirect(created.payment.authorizationUrl);
  }
  redirect(`/passes/${created.pass.id}`);
}

export async function swapPassVehicle(_prev: BookState, form: FormData): Promise<BookState> {
  const passId = field(form, 'passId');
  const vehicleId = field(form, 'vehicleId');
  const driver = await requireDriver(`/passes/${passId}`);
  try {
    await apiAs<Pass>(driver.accessToken, `/v1/passes/${encodeURIComponent(passId)}/swap-vehicle`, {
      method: 'POST',
      body: { vehicleId },
    });
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/passes/${passId}`);
}

export async function renewPass(_prev: BookState, form: FormData): Promise<BookState> {
  const passId = field(form, 'passId');
  const driver = await requireDriver(`/passes/${passId}`);
  let created: CreatePassResponse;
  try {
    created = await apiAs<CreatePassResponse>(
      driver.accessToken,
      `/v1/passes/${encodeURIComponent(passId)}/renew`,
      {
        method: 'POST',
        headers: { 'idempotency-key': `renew-${passId}-${minuteBucket()}` },
        body: {
          source: 'WEB',
          returnTo: `${await siteOrigin()}/passes`,
        },
      },
    );
  } catch (err) {
    return { error: message(err) };
  }
  if (created.payment.authorizationUrl) {
    redirect(created.payment.authorizationUrl);
  }
  redirect(`/passes/${created.pass.id}`);
}

export async function joinPassWaitlist(_prev: BookState, form: FormData): Promise<BookState> {
  const lotId = field(form, 'lotId');
  const desiredStart = field(form, 'desiredStart');
  const back = field(form, 'back') || '/passes';
  const driver = await requireDriver(back);
  try {
    await apiAs<PassWaitlistResponse>(driver.accessToken, '/v1/passes/waitlist', {
      method: 'POST',
      body: { lotId, desiredStart },
    });
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`${back}${back.includes('?') ? '&' : '?'}waitlisted=1`);
}

export async function verifyDriverIdentity(_prev: BookState, form: FormData): Promise<BookState> {
  const back = field(form, 'back') || '/passes';
  const method = field(form, 'method') === 'NIN' ? 'NIN' : 'DRIVERS_LICENSE';
  const idNumber = field(form, 'idNumber');
  const dateOfBirth = field(form, 'dateOfBirth');
  const driver = await requireDriver(back);
  try {
    await apiAs<DriverVerification>(driver.accessToken, '/v1/me/verification', {
      method: 'POST',
      body: {
        method,
        idNumber,
        ...(dateOfBirth ? { dateOfBirth } : {}),
      },
    });
  } catch (err) {
    return { error: message(err) };
  }
  redirect(back);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import type {
  RevealContactResponse,
  SupportBooking,
  SupportSearchResponse,
} from '@parkly/contracts';
import { publicEnv } from '../env';
import { nairaToKobo } from './money';
import { STEP_UP_MESSAGE } from '../auth/step-up';

export type WaiveState = { error?: string; done?: boolean } | undefined;

/** FR-BOOK-008: waive an overstay with a reason; the API checks the role and audits it. */
export async function waiveOverstay(_prev: WaiveState, form: FormData): Promise<WaiveState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const bookingId = String(form.get('bookingId') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 5) return { error: 'Write a reason of at least 5 characters.' };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/bookings/${encodeURIComponent(bookingId)}/overstay/waive`,
      session.accessToken,
      { method: 'POST', body: { reason } },
    );
  } catch (err) {
    if (err instanceof ApiProblem) {
      if (err.code === 'OVERSTAY_NOT_DUE')
        return { error: 'Nothing to waive: it was paid or waived already. Reload the page.' };
      if (err.code === 'FORBIDDEN') return { error: 'Your role can’t waive overstay.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }
  revalidatePath('/bookings');
  return { done: true };
}

export type SupportResult =
  | { ok: true; kind: SupportSearchResponse['kind']; items: SupportBooking[] }
  | { ok: false; error: string };

/** FR-ADM-002: live search for the bookings page; the API reads what was typed. */
export async function searchSupport(q: string): Promise<SupportResult> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const text = q.trim();
  if (text.length < 4) return { ok: true, kind: 'INVALID', items: [] };
  try {
    const res = await apiFetch<SupportSearchResponse>(
      publicEnv().apiUrl,
      `/v1/admin/support/search?q=${encodeURIComponent(text.slice(0, 100))}`,
      session.accessToken,
    );
    return { ok: true, kind: res.kind, items: res.items };
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'FORBIDDEN')
      return { ok: false, error: 'Your role can’t search bookings.' };
    return { ok: false, error: 'Search didn’t work just now. Try again.' };
  }
}

export type RevealState =
  { error?: string; field?: 'phone' | 'email'; value?: string | null } | undefined;

/** Show a driver's full phone or email; the API audits it with the reason. */
export async function revealContact(_prev: RevealState, form: FormData): Promise<RevealState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const bookingId = String(form.get('bookingId') ?? '');
  const field = form.get('field') === 'email' ? 'email' : 'phone';
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 5) return { error: 'Say why you need it (at least 5 characters).' };
  try {
    const res = await apiFetch<RevealContactResponse>(
      publicEnv().apiUrl,
      `/v1/admin/bookings/${encodeURIComponent(bookingId)}/reveal`,
      session.accessToken,
      { method: 'POST', body: { field, reason } },
    );
    return { field: res.field, value: res.value };
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'FORBIDDEN')
      return { error: 'Your role can’t see drivers’ contact details.' };
    return { error: 'Something went wrong. Please try again.' };
  }
}

export type ActionState = { error?: string; done?: string } | undefined;

function actionError(err: unknown, fallback: string): string {
  if (err instanceof ApiProblem) {
    if (err.code === 'FORBIDDEN') return 'Your role can’t do this.';
    if (err.code === 'STEP_UP_REQUIRED') return STEP_UP_MESSAGE;
    if (err.code === 'FOUR_EYES_REQUIRED') return 'Another finance admin has to decide this one.';
    if (err.code === 'REFUND_EXCEEDS_REFUNDABLE')
      return err.detail || 'That is more than is left to refund on this booking.';
    if (err.code === 'BOOKING_NOT_CANCELLABLE')
      return 'This booking can’t be cancelled any more (it may have started or ended).';
    if (err.code === 'INVALID_STATE_TRANSITION') return err.detail || 'This was already done.';
  }
  return fallback;
}

/** FR-ADM-003: cancel under the normal policy; the reason is audited. */
export async function cancelBookingAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const bookingId = String(form.get('bookingId') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 5) return { error: 'Say why (at least 5 characters).' };
  try {
    const res = await apiFetch<{ refundKobo: number }>(
      publicEnv().apiUrl,
      `/v1/admin/bookings/${encodeURIComponent(bookingId)}/cancel`,
      session.accessToken,
      {
        method: 'POST',
        body: { reason },
        headers: { 'idempotency-key': String(form.get('idempotencyKey') ?? '') },
      },
    );
    revalidatePath(`/bookings/${bookingId}`);
    return {
      done:
        res.refundKobo > 0
          ? `Cancelled. ₦${(res.refundKobo / 100).toLocaleString('en-NG')} is being refunded.`
          : 'Cancelled. No refund was due under the policy.',
    };
  } catch (err) {
    return { error: actionError(err, 'Something went wrong. Please try again.') };
  }
}

/** FR-ADM-003: a refund staff choose; over the threshold it waits for a second finance admin. */
export async function refundBookingAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const bookingId = String(form.get('bookingId') ?? '');
  const amountKobo = nairaToKobo(String(form.get('amount') ?? ''));
  const reason = String(form.get('reason') ?? '');
  const note = String(form.get('note') ?? '').trim();
  if (amountKobo === null) return { error: 'Enter an amount in naira, e.g. 1500 or 1500.50.' };
  if (note.length < 5) return { error: 'Explain the refund (at least 5 characters).' };
  try {
    const res = await apiFetch<{ outcome: 'ISSUED' | 'PENDING_APPROVAL' }>(
      publicEnv().apiUrl,
      `/v1/admin/bookings/${encodeURIComponent(bookingId)}/refunds`,
      session.accessToken,
      {
        method: 'POST',
        body: { amountKobo, reason, note },
        headers: { 'idempotency-key': String(form.get('idempotencyKey') ?? '') },
      },
    );
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/finance/refunds');
    return {
      done:
        res.outcome === 'ISSUED'
          ? 'Refund sent. The driver has been told.'
          : 'Over the approval limit: waiting for another finance admin under Finance → Refund approvals.',
    };
  } catch (err) {
    return { error: actionError(err, 'Something went wrong. Please try again.') };
  }
}

/** Send the confirmation and ticket again (at most once a minute). */
export async function resendTicketAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const bookingId = String(form.get('bookingId') ?? '');
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/bookings/${encodeURIComponent(bookingId)}/resend-ticket`,
      session.accessToken,
      { method: 'POST' },
    );
    return { done: 'Ticket sent again by SMS, push and email.' };
  } catch (err) {
    return { error: actionError(err, 'Couldn’t resend just now. Please try again.') };
  }
}

/** Approve or reject a refund request (a different finance admin from the one who asked). */
export async function decideRefundAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const id = String(form.get('requestId') ?? '');
  const decision = form.get('decision') === 'reject' ? 'reject' : 'approve';
  const note = String(form.get('note') ?? '').trim();
  if (decision === 'reject' && note.length < 5)
    return { error: 'Say why you are rejecting it (at least 5 characters).' };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/refund-requests/${encodeURIComponent(id)}/${decision}`,
      session.accessToken,
      {
        method: 'POST',
        body: note ? { note } : {},
        ...(decision === 'approve'
          ? { headers: { 'idempotency-key': String(form.get('idempotencyKey') ?? '') } }
          : {}),
      },
    );
    revalidatePath('/finance/refunds');
    return { done: decision === 'approve' ? 'Approved: the refund has been sent.' : 'Rejected.' };
  } catch (err) {
    return { error: actionError(err, 'Something went wrong. Please try again.') };
  }
}

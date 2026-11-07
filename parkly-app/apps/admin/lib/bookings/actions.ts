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

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
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

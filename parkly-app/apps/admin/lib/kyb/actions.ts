'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { STEP_UP_MESSAGE } from '../auth/step-up';
import { publicEnv } from '../env';
import { percentToBps } from './commission';

async function token(): Promise<string> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  return session.accessToken;
}

const base = (operatorId: string) => `/v1/admin/operators/${encodeURIComponent(operatorId)}`;

/** A 5-minute link to a private KYB document; the API audits every request. */
export async function kybDocumentLink(
  operatorId: string,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ url: string }>(
      publicEnv().apiUrl,
      `${base(operatorId)}/kyb-documents/${encodeURIComponent(documentId)}/url`,
      await token(),
    );
    return { ok: true, url: res.url };
  } catch {
    return { ok: false, error: 'This document can’t be opened right now.' };
  }
}

export type ReviewState = { error?: string } | undefined;

function reviewError(err: unknown): string {
  if (err instanceof ApiProblem) {
    if (err.code === 'PAYMENT_PROVIDER_UNAVAILABLE')
      return 'Paystack didn’t respond, so nothing was approved. Try again in a few minutes.';
    if (err.code === 'INVALID_STATE_TRANSITION')
      return 'This KYB is no longer awaiting review (someone may have just reviewed it). Reload the page.';
    if (err.code === 'VALIDATION_FAILED') return 'Write a reason of at least 5 characters.';
    if (err.code === 'FORBIDDEN') return 'Your role can’t review KYB.';
  }
  return 'Something went wrong. Please try again.';
}

export async function reviewKyb(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const decision = String(form.get('decision') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (decision === 'REJECT' && reason.length < 5)
    return { error: 'Tell the operator what to fix (at least 5 characters).' };
  try {
    await apiFetch(publicEnv().apiUrl, `${base(operatorId)}/kyb/review`, await token(), {
      method: 'POST',
      body: decision === 'REJECT' ? { decision, reason } : { decision: 'APPROVE' },
    });
  } catch (err) {
    return { error: reviewError(err) };
  }
  revalidatePath('/kyb');
  redirect(`/kyb?reviewed=${decision === 'REJECT' ? 'rejected' : 'approved'}`);
}

export type CommissionState = { error?: string; saved?: number } | undefined;

/** Change the operator's commission (finance or super admin); new bookings only. */
export async function setCommission(
  _prev: CommissionState,
  form: FormData,
): Promise<CommissionState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const commissionBps = percentToBps(String(form.get('percent') ?? ''));
  const reason = String(form.get('reason') ?? '').trim();
  if (commissionBps === null) return { error: 'Enter a rate from 10% to 15%.' };
  if (reason.length < 5)
    return { error: 'Write why the rate is changing (at least 5 characters).' };
  try {
    await apiFetch(publicEnv().apiUrl, `${base(operatorId)}/commission`, await token(), {
      method: 'PUT',
      body: { commissionBps, reason },
    });
  } catch (err) {
    if (err instanceof ApiProblem) {
      if (err.code === 'FORBIDDEN')
        return { error: 'Only finance and super admins can change rates.' };
      if (err.code === 'STEP_UP_REQUIRED') return { error: STEP_UP_MESSAGE };
      if (err.code === 'VALIDATION_FAILED')
        return { error: err.detail || 'Check the rate (10–15%) and the reason.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }
  revalidatePath('/finance/rates');
  return { saved: commissionBps };
}

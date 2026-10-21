'use server';

import type { CreateVerificationRequest } from '@parkly/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';
import { CHECKLIST, lagosLocalToIso, PROBLEM_TEXT } from './copy';

async function token(): Promise<string> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  return session.accessToken;
}

export type ActionState = { error?: string; done?: string } | undefined;

const enc = encodeURIComponent;

function problemText(err: unknown): string {
  if (!(err instanceof ApiProblem)) return 'Something went wrong. Please try again.';
  const listed = (err.errors ?? [])
    .map((e) => PROBLEM_TEXT[e.path as keyof typeof PROBLEM_TEXT] ?? null)
    .filter(Boolean);
  switch (err.code) {
    case 'INVALID_STATE_TRANSITION':
      return 'This was already decided or the lot has moved on. Reload the page.';
    case 'FORBIDDEN':
      return 'Your role can’t do this.';
    case 'FOUR_EYES_REQUIRED':
      return 'Another ops person must review a visit you recorded.';
    case 'PERMIT_EXPIRED':
      return 'This permit has expired, so it can’t be approved. Reject it and ask for the renewal.';
    case 'VERIFICATION_CHECKLIST_FAILED':
      return 'Required checks did not pass, so this visit can only be rejected.';
    case 'LOT_PERMIT_INVALID':
    case 'LOT_NOT_LISTABLE':
      return `The lot can’t go live yet: ${listed.join('; ')}.`;
    case 'VALIDATION_FAILED':
      return err.errors?.[0]?.message ?? 'Check the details and try again.';
    case 'UPLOAD_NOT_RECEIVED':
      return 'The photo file is missing from storage.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Runs one admin call; on success refreshes the lot page and says what happened. */
async function run(lotId: string, path: string, body: unknown, done: string): Promise<ActionState> {
  try {
    await apiFetch(publicEnv().apiUrl, path, await token(), { method: 'POST', body });
  } catch (err) {
    return { error: problemText(err) };
  }
  revalidatePath(`/lots/${lotId}`);
  revalidatePath('/lots');
  return { done };
}

function decision(
  form: FormData,
): { decision: 'APPROVE' } | { decision: 'REJECT'; reason: string } | string {
  const reason = String(form.get('reason') ?? '').trim();
  if (form.get('decision') !== 'REJECT') return { decision: 'APPROVE' };
  return reason.length < 5
    ? 'Write a reason of at least 5 characters.'
    : { decision: 'REJECT', reason };
}

/** A 5-minute link to the permit scan; the API audits every request. */
export async function permitDocumentLink(
  permitId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<{ url: string }>(
      publicEnv().apiUrl,
      `/v1/admin/permits/${enc(permitId)}/document-url`,
      await token(),
    );
    return { ok: true, url: res.url };
  } catch {
    return { ok: false, error: 'The permit scan can’t be opened right now.' };
  }
}

export async function reviewPermit(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const permitId = String(form.get('permitId') ?? '');
  const note = String(form.get('note') ?? '').trim();
  const d = decision(form);
  if (typeof d === 'string') return { error: d };
  if (d.decision === 'APPROVE' && note.length < 5)
    return {
      error: 'Say how LASPA confirmed the permit and the reference (at least 5 characters).',
    };
  return run(
    lotId,
    `/v1/admin/permits/${enc(permitId)}/review`,
    d.decision === 'APPROVE' ? { decision: 'APPROVE', note } : d,
    d.decision === 'APPROVE' ? 'Permit approved.' : 'Permit rejected.',
  );
}

export async function reviewRatePlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  const d = decision(form);
  if (typeof d === 'string') return { error: d };
  return run(
    String(form.get('lotId') ?? ''),
    `/v1/admin/rate-plans/${enc(String(form.get('ratePlanId') ?? ''))}/review`,
    d,
    d.decision === 'APPROVE' ? 'Price approved.' : 'Price rejected.',
  );
}

export async function reviewPhoto(_prev: ActionState, form: FormData): Promise<ActionState> {
  const d = decision(form);
  if (typeof d === 'string') return { error: d };
  return run(
    String(form.get('lotId') ?? ''),
    `/v1/admin/lot-photos/${enc(String(form.get('photoId') ?? ''))}/review`,
    d,
    d.decision === 'APPROVE' ? 'Photo approved and published.' : 'Photo rejected.',
  );
}

export async function recordVisit(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const inspectedAt = lagosLocalToIso(String(form.get('inspectedAt') ?? ''));
  if (!inspectedAt) return { error: 'Enter when the visit happened.' };
  const capacityCounted = Number(form.get('capacityCounted'));
  if (!Number.isInteger(capacityCounted) || capacityCounted < 1)
    return { error: 'Enter the number of spaces counted on site.' };
  const lat = String(form.get('lat') ?? '').trim();
  const lng = String(form.get('lng') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  const items: CreateVerificationRequest['items'] = CHECKLIST.flatMap(({ item }) => {
    const result = form.get(`result:${item}`);
    if (result !== 'PASS' && result !== 'FAIL' && result !== 'NA') return [];
    const comment = String(form.get(`comment:${item}`) ?? '').trim();
    return [{ item, result, ...(comment && { comment }) }];
  });
  if (items.length === 0) return { error: 'Mark at least one checklist item.' };
  const body: CreateVerificationRequest = {
    inspectedAt,
    capacityCounted,
    items,
    ...(lat && lng && { gps: { lat: Number(lat), lng: Number(lng) } }),
    ...(notes && { notes }),
  };
  return run(lotId, `/v1/admin/lots/${enc(lotId)}/verifications`, body, 'Visit recorded.');
}

export async function reviewVisit(_prev: ActionState, form: FormData): Promise<ActionState> {
  const d = decision(form);
  if (typeof d === 'string') return { error: d };
  return run(
    String(form.get('lotId') ?? ''),
    `/v1/admin/verifications/${enc(String(form.get('verificationId') ?? ''))}/review`,
    d,
    d.decision === 'APPROVE' ? 'Visit approved.' : 'Visit rejected.',
  );
}

const STATUS_DONE: Record<string, string> = {
  LIVE: 'The lot is live.',
  DRAFT: 'Sent back to the operator.',
  SUSPENDED: 'The lot is suspended.',
  ARCHIVED: 'The lot is archived.',
};

export async function changeLotStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  const lotId = String(form.get('lotId') ?? '');
  const status = String(form.get('status') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (form.get('needsReason') === 'yes' && reason.length < 5)
    return { error: 'Write a reason of at least 5 characters; the operator sees it.' };
  return run(
    lotId,
    `/v1/admin/lots/${enc(lotId)}/status`,
    { status, ...(reason && { reason }) },
    STATUS_DONE[status] ?? 'Done.',
  );
}

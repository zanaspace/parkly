'use server';

import type { Lot, PresignUploadResponse } from '@parkly/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';
import { kybProblemMessage } from '../operators/kyb-copy';
import { lotFieldErrors, readHoursForm, readLotForm } from './form';
import { describeLotGaps, readRatePlanForm } from './pricing';

export type LotFormState =
  { error?: string; fieldErrors?: Record<string, string>; saved?: boolean } | undefined;

async function token(): Promise<string> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  return session.accessToken;
}

const lotsPath = (operatorId: string) => `/v1/operators/${encodeURIComponent(operatorId)}/lots`;

function problemState(err: unknown): LotFormState {
  if (!(err instanceof ApiProblem)) return { error: 'Something went wrong. Please try again.' };
  if (err.code === 'CONFLICT_STALE_VERSION')
    return {
      error: 'Someone else changed this lot just now. Reload the page to see their changes.',
    };
  if (err.code === 'INVALID_STATE_TRANSITION')
    return { error: 'This lot has been submitted, so it can’t be edited right now.' };
  const fieldErrors = lotFieldErrors(err);
  if (Object.keys(fieldErrors).length > 0)
    return { error: 'Please check the highlighted fields.', fieldErrors };
  return { error: kybProblemMessage(err) };
}

/** O-11 steps 1–3: creates the DRAFT lot, then continues on its page (hours, photos). */
export async function createLot(_prev: LotFormState, form: FormData): Promise<LotFormState> {
  const operatorId = String(form.get('operatorId') ?? '');
  let lot: Lot;
  try {
    lot = await apiFetch<Lot>(publicEnv().apiUrl, lotsPath(operatorId), await token(), {
      method: 'POST',
      body: readLotForm(form),
    });
  } catch (err) {
    return problemState(err);
  }
  redirect(`/lots/${lot.id}?created=1`);
}

export async function updateLot(_prev: LotFormState, form: FormData): Promise<LotFormState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  try {
    await apiFetch<Lot>(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}`,
      await token(),
      { method: 'PATCH', body: { ...readLotForm(form), version: Number(form.get('version')) } },
    );
  } catch (err) {
    return problemState(err);
  }
  revalidatePath(`/lots/${lotId}`);
  return { saved: true };
}

export async function saveOpeningHours(_prev: LotFormState, form: FormData): Promise<LotFormState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  try {
    await apiFetch<Lot>(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}/opening-hours`,
      await token(),
      { method: 'PUT', body: { days: readHoursForm(form) } },
    );
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'LOT_HAS_FUTURE_BOOKINGS') {
      return {
        error:
          err.detail ??
          'Cannot shorten hours: one or more confirmed driver bookings fall outside the proposed schedule. Existing bookings must be honoured.',
      };
    }
    return problemState(err);
  }
  revalidatePath(`/lots/${lotId}`);
  return { saved: true };
}

export async function presignLotPhoto(input: {
  operatorId: string;
  lotId: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ ok: true; fileId: string; uploadUrl: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<PresignUploadResponse>(
      publicEnv().apiUrl,
      `${lotsPath(input.operatorId)}/${encodeURIComponent(input.lotId)}/photos`,
      await token(),
      {
        method: 'POST',
        body: { contentType: input.contentType, sizeBytes: input.sizeBytes, sha256: input.sha256 },
      },
    );
    return { ok: true, fileId: res.fileId, uploadUrl: res.uploadUrl };
  } catch (err) {
    return { ok: false, error: problemState(err)?.error ?? 'Upload failed.' };
  }
}

export async function completeLotPhoto(input: {
  operatorId: string;
  lotId: string;
  fileId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(input.operatorId)}/${encodeURIComponent(input.lotId)}/photos/${encodeURIComponent(input.fileId)}/complete`,
      await token(),
      { method: 'POST' },
    );
  } catch (err) {
    return { ok: false, error: problemState(err)?.error ?? 'Upload failed.' };
  }
  revalidatePath(`/lots/${input.lotId}`);
  return { ok: true };
}

export async function deleteLotPhoto(form: FormData): Promise<void> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  const photoId = String(form.get('photoId') ?? '');
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}/photos/${encodeURIComponent(photoId)}`,
      await token(),
      { method: 'DELETE' },
    );
  } catch {
    // The page re-reads the photos; a failed delete leaves the photo there.
  }
  revalidatePath(`/lots/${lotId}`);
}

/** Permit scan, step 1: signed upload URL (the browser then PUTs the file). */
export async function presignPermitDocument(input: {
  operatorId: string;
  lotId: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ ok: true; fileId: string; uploadUrl: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<PresignUploadResponse>(
      publicEnv().apiUrl,
      `${lotsPath(input.operatorId)}/${encodeURIComponent(input.lotId)}/permits/document`,
      await token(),
      {
        method: 'POST',
        body: { contentType: input.contentType, sizeBytes: input.sizeBytes, sha256: input.sha256 },
      },
    );
    return { ok: true, fileId: res.fileId, uploadUrl: res.uploadUrl };
  } catch (err) {
    return { ok: false, error: problemState(err)?.error ?? 'Upload failed.' };
  }
}

/** Permit, step 2: the details plus the uploaded scan. */
export async function submitPermit(input: {
  operatorId: string;
  lotId: string;
  fileId: string;
  permitNumber: string;
  issuedAt: string;
  expiresAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(input.operatorId)}/${encodeURIComponent(input.lotId)}/permits`,
      await token(),
      {
        method: 'POST',
        body: {
          permitNumber: input.permitNumber,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
          fileId: input.fileId,
        },
      },
    );
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'PERMIT_EXPIRED')
      return {
        ok: false,
        error: 'This permit has expired. Renew it with LASPA and upload the new one.',
      };
    if (err instanceof ApiProblem && err.code === 'VALIDATION_FAILED' && err.errors?.[0])
      return { ok: false, error: err.errors[0].message };
    return { ok: false, error: problemState(err)?.error ?? 'Something went wrong.' };
  }
  revalidatePath(`/lots/${input.lotId}`);
  return { ok: true };
}

export async function saveRatePlan(_prev: LotFormState, form: FormData): Promise<LotFormState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  const parsed = readRatePlanForm(form);
  if (!parsed.ok) return { error: parsed.error };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}/rate-plans`,
      await token(),
      { method: 'PUT', body: parsed.body },
    );
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'RATE_PLAN_INVALID' && err.errors?.[0])
      return { error: err.errors[0].message };
    return problemState(err);
  }
  revalidatePath(`/lots/${lotId}`);
  return { saved: true };
}

export type SubmitLotState = { error?: string; missing?: string[] } | undefined;

export async function submitLot(_prev: SubmitLotState, form: FormData): Promise<SubmitLotState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}/submit`,
      await token(),
      { method: 'POST' },
    );
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'LOT_INCOMPLETE')
      return { error: 'A few things are still missing:', missing: describeLotGaps(err) };
    return { error: problemState(err)?.error ?? 'Something went wrong.' };
  }
  revalidatePath(`/lots/${lotId}`);
  revalidatePath('/lots');
  return undefined;
}

/** ADR 0016: the owner's self check-in switch (owner only; audited by the API). */
export async function setSelfCheckin(
  _prev: { error?: string } | undefined,
  form: FormData,
): Promise<{ error?: string } | undefined> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}/self-check-in`,
      await token(),
      { method: 'POST', body: { enabled: form.get('enabled') === 'true' } },
    );
  } catch (err) {
    return {
      error:
        err instanceof ApiProblem && err.status === 404
          ? 'Only the owner can switch self check-in.'
          : 'Something went wrong. Please try again.',
    };
  }
  revalidatePath(`/lots/${lotId}`);
  return undefined;
}

export type LotVisibilityState = { error?: string } | undefined;

/** FR-LOT-006: pause / resume listing visibility by operator (LIVE <-> PAUSED). */
export async function setLotVisibility(
  _prev: LotVisibilityState,
  form: FormData,
): Promise<LotVisibilityState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const lotId = String(form.get('lotId') ?? '');
  const visible = form.get('visible') === 'true';
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${lotsPath(operatorId)}/${encodeURIComponent(lotId)}/visibility`,
      await token(),
      { method: 'POST', body: { visible } },
    );
  } catch (err) {
    if (err instanceof ApiProblem) {
      if (err.code === 'LOT_PERMIT_INVALID' || err.code === 'LOT_NOT_LISTABLE') {
        const details = err.errors?.map((e) => e.message).join(', ');
        return {
          error: details
            ? `Cannot make listing visible: ${details}`
            : 'The lot cannot go live yet. Please make sure permits, rate plans, and inspection requirements are satisfied.',
        };
      }
      if (err.code === 'INVALID_STATE_TRANSITION') {
        return { error: 'Visibility can only be toggled for lots that are Live or Paused.' };
      }
      return { error: err.detail ?? err.message ?? 'Failed to update visibility.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }
  revalidatePath(`/lots/${lotId}`);
  revalidatePath('/lots');
  return undefined;
}


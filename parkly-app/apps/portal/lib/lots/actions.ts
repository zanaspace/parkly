'use server';

import type { Lot, PresignUploadResponse } from '@parkly/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';
import { kybProblemMessage } from '../operators/kyb-copy';
import { lotFieldErrors, readHoursForm, readLotForm } from './form';

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

'use server';

import type { KybDocumentType, PayoutAccount, PresignUploadResponse } from '@parkly/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';
import { describeKybGaps, kybProblemMessage } from './kyb-copy';

async function token(): Promise<string> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  return session.accessToken;
}

const message = (err: unknown) =>
  err instanceof ApiProblem
    ? kybProblemMessage(err)
    : kybProblemMessage(new ApiProblem(500, 'UNKNOWN'));

const base = (operatorId: string) => `/v1/operators/${encodeURIComponent(operatorId)}`;

/** Step 1 of an upload: the API returns a signed URL; the browser PUTs the file to Storage. */
export async function presignKybDocument(input: {
  operatorId: string;
  type: KybDocumentType;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<{ ok: true; fileId: string; uploadUrl: string } | { ok: false; error: string }> {
  try {
    const res = await apiFetch<PresignUploadResponse>(
      publicEnv().apiUrl,
      `${base(input.operatorId)}/kyb-documents`,
      await token(),
      {
        method: 'POST',
        body: {
          type: input.type,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256,
        },
      },
    );
    return { ok: true, fileId: res.fileId, uploadUrl: res.uploadUrl };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** Step 2: the API re-checks the stored bytes (type, size, checksum, virus scan). */
export async function completeKybDocument(input: {
  operatorId: string;
  fileId: string;
  type: KybDocumentType;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${base(input.operatorId)}/kyb-documents/${encodeURIComponent(input.fileId)}/complete`,
      await token(),
      { method: 'POST', body: { type: input.type } },
    );
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  revalidatePath('/kyb');
  return { ok: true };
}

export async function deleteKybDocument(form: FormData): Promise<void> {
  const operatorId = String(form.get('operatorId') ?? '');
  const documentId = String(form.get('documentId') ?? '');
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${base(operatorId)}/kyb-documents/${encodeURIComponent(documentId)}`,
      await token(),
      { method: 'DELETE' },
    );
  } catch {
    // The page re-reads the list; a failed delete simply leaves the document there.
  }
  revalidatePath('/kyb');
}

export type PayoutState = { error?: string; account?: PayoutAccount } | undefined;

export async function savePayoutAccount(_prev: PayoutState, form: FormData): Promise<PayoutState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const bankCode = String(form.get('bankCode') ?? '').trim();
  const accountNumber = String(form.get('accountNumber') ?? '').replace(/\s/g, '');
  if (!bankCode) return { error: 'Choose your bank.' };
  if (!/^\d{10}$/.test(accountNumber)) return { error: 'Enter the 10-digit account number.' };
  try {
    const account = await apiFetch<PayoutAccount>(
      publicEnv().apiUrl,
      `${base(operatorId)}/payout-account`,
      await token(),
      { method: 'PUT', body: { bankCode, accountNumber } },
    );
    revalidatePath('/kyb');
    return { account };
  } catch (err) {
    return { error: message(err) };
  }
}

export type SubmitState = { error?: string; missing?: string[] } | undefined;

export async function submitKyb(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const operatorId = String(form.get('operatorId') ?? '');
  try {
    await apiFetch(publicEnv().apiUrl, `${base(operatorId)}/kyb/submit`, await token(), {
      method: 'POST',
    });
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'KYB_INCOMPLETE')
      return { error: 'A few items are still missing:', missing: describeKybGaps(err) };
    return { error: message(err) };
  }
  revalidatePath('/kyb');
  revalidatePath('/');
  return undefined;
}

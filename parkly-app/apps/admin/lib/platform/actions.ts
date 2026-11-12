'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';

export type PlatformState = { error?: string; done?: string } | undefined;

function failure(err: unknown): string {
  if (err instanceof ApiProblem) {
    if (err.code === 'FORBIDDEN') return 'Only super admins can change this.';
    if (err.code === 'NOT_FOUND') return 'That setting no longer exists. Reload the page.';
    if (err.code === 'VALIDATION_FAILED')
      return err.errors?.[0]?.message ?? 'Check the value and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** FR-ADM-005: save one setting. The API checks the limits and audits the old and new value. */
export async function saveSettingAction(
  _prev: PlatformState,
  form: FormData,
): Promise<PlatformState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const key = String(form.get('key') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 5) return { error: 'Say why you are changing it (at least 5 characters).' };
  const raw = String(form.get('value') ?? '').trim();
  const isBoolean = form.get('kind') === 'boolean';
  if (!isBoolean && !/^\d{1,12}$/.test(raw)) return { error: 'Enter a whole number.' };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/settings/${encodeURIComponent(key)}`,
      session.accessToken,
      {
        method: 'PUT',
        body: { value: isBoolean ? raw === 'true' : Number(raw), reason },
      },
    );
  } catch (err) {
    return { error: failure(err) };
  }
  revalidatePath('/settings');
  return { done: 'Saved.' };
}

export async function setFlagAction(_prev: PlatformState, form: FormData): Promise<PlatformState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const key = String(form.get('key') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (reason.length < 5) return { error: 'Say why you are changing it (at least 5 characters).' };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/feature-flags/${encodeURIComponent(key)}`,
      session.accessToken,
      { method: 'PUT', body: { enabled: form.get('enabled') === 'true', reason } },
    );
  } catch (err) {
    return { error: failure(err) };
  }
  revalidatePath('/settings/flags');
  return { done: 'Saved.' };
}

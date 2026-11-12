'use server';

import type { CreateIncidentResponse } from '@parkly/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';

export type IncidentFormState = { error?: string; done?: string } | undefined;

function failure(err: unknown, fallback: string): string {
  if (err instanceof ApiProblem) {
    if (err.code === 'FORBIDDEN') return 'Your role can’t do this.';
    if (err.code === 'NOT_FOUND') return 'That car park or incident wasn’t found.';
    if (err.code === 'VALIDATION_FAILED')
      return err.detail === 'That booking is not at this car park'
        ? 'That booking is not at this car park.'
        : 'Check the details and try again.';
    if (err.code === 'INVALID_STATE_TRANSITION') return err.detail || 'This was already done.';
  }
  return fallback;
}

/** FR-INC-001: log an incident, then go to it. */
export async function createIncidentAction(
  _prev: IncidentFormState,
  form: FormData,
): Promise<IncidentFormState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const description = String(form.get('description') ?? '').trim();
  if (description.length < 10) return { error: 'Describe what happened (at least 10 characters).' };
  const lotId = String(form.get('lotId') ?? '');
  if (!lotId) return { error: 'Choose the car park.' };
  const bookingId = String(form.get('bookingId') ?? '').trim();
  let id: string;
  try {
    const res = await apiFetch<CreateIncidentResponse>(
      publicEnv().apiUrl,
      '/v1/admin/incidents',
      session.accessToken,
      {
        method: 'POST',
        body: {
          lotId,
          ...(bookingId ? { bookingId } : {}),
          category: String(form.get('category') ?? ''),
          severity: String(form.get('severity') ?? ''),
          description,
        },
      },
    );
    id = res.incident.id;
  } catch (err) {
    return { error: failure(err, 'Something went wrong. Please try again.') };
  }
  revalidatePath('/incidents');
  redirect(`/incidents/${id}`);
}

/** Triage, resolve, close or reopen. The API checks the order and audits each step. */
export async function incidentStepAction(
  _prev: IncidentFormState,
  form: FormData,
): Promise<IncidentFormState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const id = String(form.get('incidentId') ?? '');
  const action = String(form.get('action') ?? '');
  const text = String(form.get('text') ?? '').trim();
  if ((action === 'RESOLVE' || action === 'REOPEN') && text.length < 5)
    return {
      error:
        action === 'RESOLVE'
          ? 'Say how it was resolved (at least 5 characters).'
          : 'Say why (at least 5 characters).',
    };
  const body =
    action === 'RESOLVE'
      ? { action, resolution: text }
      : action === 'REOPEN'
        ? { action, reason: text }
        : { action };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/incidents/${encodeURIComponent(id)}`,
      session.accessToken,
      {
        method: 'PATCH',
        body,
      },
    );
  } catch (err) {
    return { error: failure(err, 'Something went wrong. Please try again.') };
  }
  revalidatePath(`/incidents/${id}`);
  revalidatePath('/incidents');
  return { done: 'Updated.' };
}

export async function addIncidentNoteAction(
  _prev: IncidentFormState,
  form: FormData,
): Promise<IncidentFormState> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const id = String(form.get('incidentId') ?? '');
  const body = String(form.get('body') ?? '').trim();
  if (body.length < 2) return { error: 'Write a note.' };
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `/v1/admin/incidents/${encodeURIComponent(id)}/notes`,
      session.accessToken,
      {
        method: 'POST',
        body: { body },
      },
    );
  } catch (err) {
    return { error: failure(err, 'Something went wrong. Please try again.') };
  }
  revalidatePath(`/incidents/${id}`);
  return { done: 'Note added.' };
}

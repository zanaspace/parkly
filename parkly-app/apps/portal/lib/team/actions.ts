'use server';

import type { AcceptInviteResponse, InviteMemberResponse } from '@parkly/contracts';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { loadSession } from '../auth/session';
import { publicEnv } from '../env';
import { inviteLink, teamMessage } from './copy';

async function token(): Promise<string> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  return session.accessToken;
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

const membersPath = (operatorId: string) =>
  `/v1/operators/${encodeURIComponent(operatorId)}/members`;

export type InviteState =
  | { error?: string; fieldErrors?: Record<string, string>; link?: string; name?: string }
  | undefined;

/** O-20: creates the invite and returns the link to share (shown once). */
export async function inviteMember(_prev: InviteState, form: FormData): Promise<InviteState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const role = String(form.get('role') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const contact = String(form.get('contact') ?? '').trim();
  if (name.length < 2) return { fieldErrors: { name: 'Enter their name.' } };
  if (!contact)
    return {
      fieldErrors: {
        contact: role === 'MANAGER' ? 'Enter their email address.' : 'Enter their phone number.',
      },
    };
  const body =
    role === 'MANAGER'
      ? { role, name, email: contact.toLowerCase() }
      : { role: 'ATTENDANT', name, phone: contact, lotIds: form.getAll('lotIds').map(String) };
  try {
    const res = await apiFetch<InviteMemberResponse>(
      publicEnv().apiUrl,
      membersPath(operatorId),
      await token(),
      { method: 'POST', body },
    );
    revalidatePath('/team');
    return { link: inviteLink(await origin(), res.inviteToken), name };
  } catch (err) {
    if (err instanceof ApiProblem && err.code === 'VALIDATION_FAILED') {
      const field = err.errors?.[0];
      return field?.path === 'lotIds'
        ? { error: field.message }
        : {
            fieldErrors: {
              contact:
                role === 'MANAGER'
                  ? 'Enter a valid email address.'
                  : 'Enter a Nigerian mobile number, e.g. 0803 123 4567.',
            },
          };
    }
    return { error: teamMessage(err instanceof ApiProblem ? err.code : undefined) };
  }
}

export type SimpleState = { error?: string } | undefined;

export async function removeMember(_prev: SimpleState, form: FormData): Promise<SimpleState> {
  const operatorId = String(form.get('operatorId') ?? '');
  const memberId = String(form.get('memberId') ?? '');
  try {
    await apiFetch(
      publicEnv().apiUrl,
      `${membersPath(operatorId)}/${encodeURIComponent(memberId)}`,
      await token(),
      { method: 'DELETE' },
    );
  } catch (err) {
    return { error: teamMessage(err instanceof ApiProblem ? err.code : undefined) };
  }
  revalidatePath('/team');
  return undefined;
}

/** Accepts the invite for the signed-in account, then continues to the portal (MFA first). */
export async function acceptInvite(_prev: SimpleState, form: FormData): Promise<SimpleState> {
  const inviteToken = String(form.get('inviteToken') ?? '');
  let joined: AcceptInviteResponse;
  try {
    joined = await apiFetch(publicEnv().apiUrl, '/v1/auth/invites/accept', await token(), {
      method: 'POST',
      body: { inviteToken },
    });
  } catch (err) {
    return { error: teamMessage(err instanceof ApiProblem ? err.code : undefined) };
  }
  // Attendants work from the attendant app; managers continue to the portal (MFA set-up first).
  redirect(joined.role === 'ATTENDANT' ? '/invite/joined' : '/');
}

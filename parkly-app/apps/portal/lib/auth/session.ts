import type { Me } from '@parkly/contracts';
import { redirect } from 'next/navigation';
import { apiFetch, ApiProblem } from '../api';
import { publicEnv } from '../env';
import { createClient } from '../supabase/server';
import { decideAccess, type AccessDecision, type AppKind } from './guard';

export const APP: AppKind = 'portal';

export type SignedInState = {
  signedIn: true;
  accessToken: string;
  currentLevel: string | null;
  nextLevel: string | null;
};

/** Validated session state (getClaims verifies the JWT; never trust getSession alone). */
export async function loadSession(): Promise<SignedInState | { signedIn: false }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return { signedIn: false };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { signedIn: false };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    signedIn: true,
    accessToken: session.access_token,
    currentLevel: aal?.currentLevel ?? null,
    nextLevel: aal?.nextLevel ?? null,
  };
}

/** The signed-in user's profile and roles, re-read from the API (roles are never trusted from the token). */
export async function loadMe(accessToken: string): Promise<Me | null> {
  try {
    return await apiFetch<Me>(publicEnv().apiUrl, '/v1/me', accessToken);
  } catch (err) {
    if (err instanceof ApiProblem && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

/**
 * Used by every protected layout/page. Redirects unless the user is signed in,
 * holds a role for this console and has completed MFA (aal2).
 */
export async function requireAccess(): Promise<{ me: Me; accessToken: string }> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const me = await loadMe(session.accessToken);
  const decision = decideAccess({
    app: APP,
    signedIn: me !== null,
    roles: me?.roles ?? [],
    currentLevel: session.currentLevel,
    nextLevel: session.nextLevel,
  });
  if (decision.kind !== 'ok' || !me) redirect(REDIRECTS[decision.kind]);
  return { me, accessToken: session.accessToken };
}

const REDIRECTS: Record<AccessDecision['kind'], string> = {
  'sign-in': '/sign-in',
  'no-access': '/no-access',
  'mfa-enroll': '/mfa/enroll',
  'mfa-verify': '/mfa/verify',
  onboarding: '/onboarding',
  ok: '/',
};

/** For the MFA pages: signed in with a role for this console, at any assurance level. */
export async function requireSignedInMember(): Promise<SignedInState & { me: Me }> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const me = await loadMe(session.accessToken);
  if (!me) redirect('/sign-in');
  if (
    decideAccess({
      app: APP,
      signedIn: true,
      roles: me.roles,
      currentLevel: 'aal2',
      nextLevel: 'aal2',
    }).kind === 'no-access'
  ) {
    redirect('/no-access');
  }
  return { ...session, me };
}

/**
 * For /onboarding: signed in with no role yet (a new operator). Anyone who
 * already has a role goes to the normal entry point instead.
 */
export async function requireNewcomer(): Promise<{ me: Me; accessToken: string }> {
  const session = await loadSession();
  if (!session.signedIn) redirect('/sign-in');
  const me = await loadMe(session.accessToken);
  if (!me) redirect('/sign-in');
  if (me.roles.length > 0) redirect('/');
  return { me, accessToken: session.accessToken };
}

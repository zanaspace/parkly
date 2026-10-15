import type { Me } from '@parkly/contracts';

/** Top-level route groups under app/. */
export type RouteGroup = '(auth)' | '(onboarding)' | '(app)' | undefined;

export type GuardState = {
  /** Session restored from secure storage (or confirmed absent). */
  initialised: boolean;
  signedIn: boolean;
  /** Profile from /v1/auth/bootstrap; null while it is loading. */
  me: Me | null;
  /** Active vehicles; null while loading. */
  vehicleCount: number | null;
  /** Driver tapped "Skip for now" on the vehicle step. */
  vehicleStepSkipped: boolean;
};

export type OnboardingStep = '/name' | '/vehicle' | '/consents';

/** Doc 03 §1.1 order: name → vehicle → consents → home. */
export function nextOnboardingStep(
  state: Pick<GuardState, 'me' | 'vehicleCount' | 'vehicleStepSkipped'>,
): OnboardingStep | null {
  const { me } = state;
  if (!me) return null;
  if (!me.firstName) return '/name';
  if (state.vehicleCount === 0 && !state.vehicleStepSkipped) return '/vehicle';
  if (!me.profileComplete) return '/consents';
  return null;
}

/**
 * Where the app must be, given auth state and the current route group.
 * Returns a path to `router.replace()` to, or null to stay put.
 */
export function guardRedirect(
  state: GuardState,
  current: { group: RouteGroup; path: string },
): string | null {
  if (!state.initialised) return null;

  if (!state.signedIn) {
    return current.group === '(auth)' ? null : '/welcome';
  }

  // Signed in but bootstrap/vehicles still loading: stay where we are (OTP screen shows a spinner).
  if (!state.me || state.vehicleCount === null) return null;

  const step = nextOnboardingStep(state);
  if (step) return current.path === step ? null : step;

  return current.group === '(app)' ? null : '/home';
}

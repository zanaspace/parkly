import type { Me } from '@parkly/contracts';
import { describe, expect, it } from 'vitest';
import { guardRedirect, nextOnboardingStep, type GuardState } from './route-guard';

const me = (patch: Partial<Me> = {}): Me => ({
  id: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
  firstName: 'Ada',
  lastName: null,
  phoneLast4: '4567',
  status: 'ACTIVE',
  roles: [{ role: 'DRIVER', operatorId: null }],
  profileComplete: true,
  consents: { termsVersion: '2026-10-01', privacyVersion: '2026-10-01', marketing: false },
  currentLegalVersions: { terms: '2026-10-01', privacy: '2026-10-01' },
  ...patch,
});

const state = (patch: Partial<GuardState> = {}): GuardState => ({
  initialised: true,
  signedIn: true,
  me: me(),
  vehicleCount: 1,
  vehicleStepSkipped: false,
  ...patch,
});

describe('nextOnboardingStep (doc 03 §1.1)', () => {
  it('asks for a name first', () => {
    expect(
      nextOnboardingStep(
        state({ me: me({ firstName: null, profileComplete: false }), vehicleCount: 0 }),
      ),
    ).toBe('/name');
  });
  it('then a vehicle, unless skipped', () => {
    expect(nextOnboardingStep(state({ me: me({ profileComplete: false }), vehicleCount: 0 }))).toBe(
      '/vehicle',
    );
    expect(
      nextOnboardingStep(
        state({ me: me({ profileComplete: false }), vehicleCount: 0, vehicleStepSkipped: true }),
      ),
    ).toBe('/consents');
  });
  it('then consents', () => {
    expect(nextOnboardingStep(state({ me: me({ profileComplete: false }) }))).toBe('/consents');
  });
  it('is done when the profile is complete', () => {
    expect(nextOnboardingStep(state())).toBeNull();
    expect(nextOnboardingStep(state({ me: null }))).toBeNull();
  });
});

describe('guardRedirect', () => {
  it('waits until the stored session is restored', () => {
    expect(
      guardRedirect(state({ initialised: false, signedIn: false }), {
        group: '(app)',
        path: '/home',
      }),
    ).toBeNull();
  });

  it('sends signed-out users to welcome, but lets them move around the auth stack', () => {
    const out = state({ signedIn: false, me: null, vehicleCount: null });
    expect(guardRedirect(out, { group: '(app)', path: '/home' })).toBe('/welcome');
    expect(guardRedirect(out, { group: undefined, path: '/' })).toBe('/welcome');
    expect(guardRedirect(out, { group: '(auth)', path: '/otp' })).toBeNull();
  });

  it('stays put while the profile is loading after sign-in', () => {
    expect(
      guardRedirect(state({ me: null, vehicleCount: null }), { group: '(auth)', path: '/otp' }),
    ).toBeNull();
    expect(
      guardRedirect(state({ vehicleCount: null }), { group: '(auth)', path: '/otp' }),
    ).toBeNull();
  });

  it('routes incomplete profiles to the right onboarding step', () => {
    const s = state({ me: me({ firstName: null, profileComplete: false }), vehicleCount: 0 });
    expect(guardRedirect(s, { group: '(auth)', path: '/otp' })).toBe('/name');
    expect(guardRedirect(s, { group: '(onboarding)', path: '/name' })).toBeNull();
    expect(guardRedirect(s, { group: '(app)', path: '/home' })).toBe('/name');
  });

  it('sends complete profiles home and keeps them in the app', () => {
    expect(guardRedirect(state(), { group: '(auth)', path: '/otp' })).toBe('/home');
    expect(guardRedirect(state(), { group: '(onboarding)', path: '/consents' })).toBe('/home');
    expect(guardRedirect(state(), { group: '(app)', path: '/account' })).toBeNull();
  });
});

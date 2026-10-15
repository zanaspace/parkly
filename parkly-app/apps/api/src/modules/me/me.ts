import type { Me } from '@parkly/contracts';
import type { RoleGrant } from '@parkly/domain/authz';
import type { Store, UserRow } from '../../store/types.js';

export async function legalVersions(store: Store) {
  return {
    terms: (await store.settings.get<string>('legal.terms_version')) ?? 'unset',
    privacy: (await store.settings.get<string>('legal.privacy_version')) ?? 'unset',
  };
}

/**
 * The profile every app reads after sign-in. Drivers are "complete" once they
 * have a first name and have accepted the current Terms and Privacy Notice
 * (FR-AUTH-002); staff only need a name.
 */
export async function buildMe(store: Store, user: UserRow, roles: RoleGrant[]): Promise<Me> {
  const [consents, current] = await Promise.all([
    store.consents.latest(user.id),
    legalVersions(store),
  ]);
  const terms = consents.TERMS?.granted ? consents.TERMS.version : null;
  const privacy = consents.PRIVACY?.granted ? consents.PRIVACY.version : null;
  const isDriver = roles.some((r) => r.role === 'DRIVER');
  const consentsCurrent = terms === current.terms && privacy === current.privacy;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneLast4: user.phoneLast4,
    status: user.status,
    roles,
    profileComplete: !!user.firstName && (!isDriver || consentsCurrent),
    consents: { termsVersion: terms, privacyVersion: privacy, marketing: user.marketingOptIn },
    currentLegalVersions: current,
  };
}

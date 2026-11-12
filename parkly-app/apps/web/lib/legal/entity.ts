/**
 * Who Parkly is, in the legal documents. Counsel and the owner fill these in before launch;
 * until then the pages show a visible "to be completed" marker instead of a made-up value,
 * so nothing can go live with a blank or invented company name by accident.
 */
export const LEGAL_ENTITY = {
  companyName: null as string | null,
  registration: null as string | null,
  address: null as string | null,
  privacyEmail: null as string | null,
  supportEmail: null as string | null,
  dpoName: null as string | null,
} as const;

export type EntityKey = keyof typeof LEGAL_ENTITY;

const LABEL: Record<EntityKey, string> = {
  companyName: 'company legal name',
  registration: 'CAC registration number',
  address: 'registered address',
  privacyEmail: 'privacy email address',
  supportEmail: 'support email address',
  dpoName: 'Data Protection Officer',
};

/** The value, or a marker that cannot be mistaken for text. */
export function entity(key: EntityKey): string {
  return LEGAL_ENTITY[key] ?? `[${LABEL[key]}: to be completed]`;
}

/** Replaces {{companyName}} style tokens in a line of legal text. */
export function fill(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in LEGAL_ENTITY ? entity(key as EntityKey) : whole,
  );
}

/** Every value still missing, so a launch check can list them. */
export function missingEntityFields(): string[] {
  return (Object.keys(LEGAL_ENTITY) as EntityKey[])
    .filter((k) => LEGAL_ENTITY[k] === null)
    .map((k) => LABEL[k]);
}

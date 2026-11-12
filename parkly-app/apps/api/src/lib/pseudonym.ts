import { createHash } from 'node:crypto';

/**
 * A one-way stand-in for a plate (doc 06 section 5): the same plate gives the
 * same value inside one erasure, so a person's history still groups, but it
 * cannot be turned back into the plate or matched to another person's. The salt
 * is thrown away after use.
 */
export function pseudonymise(value: string, salt: string): string {
  return `~${createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 10)}`;
}

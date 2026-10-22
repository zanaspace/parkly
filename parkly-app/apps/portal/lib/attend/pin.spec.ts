import { describe, expect, it } from 'vitest';
import { hashPin, isValidPin, MAX_PIN_TRIES, verifyPin } from './pin';

describe('attendant PIN (doc 05 §4.4)', () => {
  it('accepts exactly six digits', () => {
    expect(isValidPin('123456')).toBe(true);
    for (const bad of ['12345', '1234567', '12345a', '']) expect(isValidPin(bad)).toBe(false);
  });

  it('stores only a salted hash and checks it', async () => {
    const stored = await hashPin('482913');
    expect(JSON.stringify(stored)).not.toContain('482913');
    expect(await verifyPin('482913', stored)).toBe(true);
    expect(await verifyPin('482914', stored)).toBe(false);
    // Same PIN, different salt: different hash.
    expect((await hashPin('482913')).hash).not.toBe(stored.hash);
  });

  it('allows five tries before the phone is wiped', () => {
    expect(MAX_PIN_TRIES).toBe(5);
  });
});

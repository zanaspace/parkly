import { describe, expect, it } from 'vitest';
import { formatCountdown, retryAfterSeconds } from './countdown';

const now = new Date('2026-10-19T08:00:00Z');

describe('retryAfterSeconds', () => {
  it('reads delta seconds', () => {
    expect(retryAfterSeconds('120', now)).toBe(120);
    expect(retryAfterSeconds(' 0 ', now)).toBe(1);
  });
  it('reads an HTTP date', () => {
    expect(retryAfterSeconds('Mon, 19 Oct 2026 08:01:30 GMT', now)).toBe(90);
  });
  it('falls back when missing or unreadable', () => {
    expect(retryAfterSeconds(null, now)).toBe(60);
    expect(retryAfterSeconds('soon', now, 30)).toBe(30);
  });
});

describe('formatCountdown', () => {
  it.each([
    [75, '1:15'],
    [9, '0:09'],
    [0, '0:00'],
    [-3, '0:00'],
    [59.2, '1:00'],
  ])('%d → %s', (s, text) => {
    expect(formatCountdown(s)).toBe(text);
  });
});

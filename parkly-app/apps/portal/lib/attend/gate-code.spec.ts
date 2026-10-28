import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { attendantCode } from './gate-code';

describe('attendant gate code (gap review G-2)', () => {
  it('signs exactly what the API checks, and changes every minute', async () => {
    const lotId = '01a162b3-dcae-740c-a25a-e148a6951c2e';
    const key = randomBytes(32);
    const now = new Date('2026-10-20T08:00:30Z');
    const minute = Math.floor(now.getTime() / 60_000);
    const sig = createHmac('sha256', key)
      .update(`PKGA.${lotId}.${minute}`)
      .digest('base64url')
      .slice(0, 16);
    expect(await attendantCode(lotId, key.toString('base64url'), now)).toBe(
      `PKGA.${lotId}.${minute}.${sig}`,
    );
    const later = await attendantCode(
      lotId,
      key.toString('base64url'),
      new Date(now.getTime() + 60_000),
    );
    expect(later).not.toBe(`PKGA.${lotId}.${minute}.${sig}`);
  });
});

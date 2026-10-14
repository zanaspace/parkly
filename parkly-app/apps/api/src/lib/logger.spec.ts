import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, maskPhone } from './logger.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, logger: createLogger({ level: 'info', stream }) };
}

describe('logger redaction (doc 05 §logging)', () => {
  it('removes secrets and masks phone numbers and emails', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        headers: { authorization: 'Bearer abc.def.ghi', cookie: 'sb=1' },
        otp: '123456',
        password: 'p@ss',
        token: 'tok',
        refreshToken: 'rt',
        user: { phone: '+2348031234567', email: 'ada@example.com' },
        bank: { accountNumber: '0123456789' },
      },
      'login',
    );
    const out = lines.join('');
    for (const secret of [
      'abc.def.ghi',
      'sb=1',
      '123456',
      'p@ss',
      '"tok"',
      '"rt"',
      '0123456789',
      'ada@example.com',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('+234******4567');
    expect(out).toContain('a***@example.com');
  });

  it.each([
    ['+2348031234567', '+234******4567'],
    ['0803', '****'],
  ])('maskPhone(%s) = %s', (raw, masked) => {
    expect(maskPhone(raw)).toBe(masked);
  });
});

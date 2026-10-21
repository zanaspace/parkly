import { describe, expect, it } from 'vitest';
import { PresignKybDocumentRequestSchema, SetPayoutAccountRequestSchema } from './kyb.js';

const sha = 'a'.repeat(64);

describe('KYB document upload request (doc 03 O-04)', () => {
  it('accepts PDF, JPG and PNG up to 10 MB', () => {
    for (const contentType of ['application/pdf', 'image/jpeg', 'image/png']) {
      expect(
        PresignKybDocumentRequestSchema.safeParse({
          type: 'CAC_CERT',
          contentType,
          sizeBytes: 10 * 1024 * 1024,
          sha256: sha,
        }).success,
      ).toBe(true);
    }
  });

  it('refuses other types, oversize files and bad checksums', () => {
    const base = { type: 'CAC_CERT', contentType: 'application/pdf', sizeBytes: 1000, sha256: sha };
    for (const bad of [
      { contentType: 'image/svg+xml' },
      { contentType: 'text/html' },
      { sizeBytes: 10 * 1024 * 1024 + 1 },
      { sizeBytes: 0 },
      { sha256: 'xyz' },
      { type: 'PASSPORT' },
    ]) {
      expect(
        PresignKybDocumentRequestSchema.safeParse({ ...base, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });
});

describe('payout account request', () => {
  it('takes a bank code and a 10-digit NUBAN', () => {
    expect(
      SetPayoutAccountRequestSchema.safeParse({ bankCode: '058', accountNumber: '0123456789' })
        .success,
    ).toBe(true);
  });
  it.each(['012345678', '01234567890', '01234-56789', 'abcdefghij'])(
    'rejects account number %s',
    (n) => {
      expect(
        SetPayoutAccountRequestSchema.safeParse({ bankCode: '058', accountNumber: n }).success,
      ).toBe(false);
    },
  );
});

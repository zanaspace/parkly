import { describe, expect, it } from 'vitest';
import { parseProblem } from '../api';
import {
  DOCUMENT_LABELS,
  describeKybGaps,
  formatBytes,
  kybProblemMessage,
  REQUIRED_DOCUMENTS,
} from './kyb-copy';

describe('KYB copy', () => {
  it('names the three required documents in plain language', () => {
    expect(REQUIRED_DOCUMENTS.map((t) => DOCUMENT_LABELS[t])).toEqual([
      'CAC certificate',
      'Director ID (NIN slip, passport or driver’s licence)',
      'Proof of address (utility bill)',
    ]);
  });

  it('turns KYB_INCOMPLETE into a readable list', () => {
    const p = parseProblem(422, {
      code: 'KYB_INCOMPLETE',
      errors: [
        { path: 'DOCUMENT_DIRECTOR_ID', message: 'x' },
        { path: 'PAYOUT_ACCOUNT', message: 'x' },
        { path: 'BUSINESS_DETAILS', message: 'x' },
      ],
    });
    expect(describeKybGaps(p)).toEqual([
      'Director ID (NIN slip, passport or driver’s licence)',
      'Bank account for payouts',
      'Business details (CAC number, address, contact email and phone)',
    ]);
  });

  it.each([
    ['UPLOAD_REJECTED', 'MALWARE', /virus scan/],
    ['UPLOAD_REJECTED', 'TYPE_MISMATCH', /not a real PDF, JPG or PNG/],
    ['UPLOAD_REJECTED', 'SIZE_MISMATCH', /incomplete/],
    ['UPLOAD_REJECTED', 'EXPIRED', /took too long/],
    ['UPLOAD_TYPE_NOT_ALLOWED', undefined, /PDF, JPG or PNG/],
    ['PAYOUT_ACCOUNT_UNRESOLVED', undefined, /couldn’t find that account/],
    ['PAYMENT_PROVIDER_UNAVAILABLE', undefined, /try again/],
    ['INVALID_STATE_TRANSITION', undefined, /submitted/],
  ] as const)('%s %s → helpful message', (code, detail, pattern) => {
    expect(kybProblemMessage(parseProblem(400, { code, detail }))).toMatch(pattern);
  });

  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [1536 * 1024, '1.5 MB'],
  ])('formats %i bytes as %s', (n, s) => {
    expect(formatBytes(n)).toBe(s);
  });
});

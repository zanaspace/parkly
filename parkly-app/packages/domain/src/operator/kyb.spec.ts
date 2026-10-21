import { describe, expect, it } from 'vitest';
import { accountNameMatches, kybSubmissionGaps, REQUIRED_KYB_DOCUMENTS } from './kyb.js';

describe('KYB submission (FR-LOT-001, doc 03 O-04/O-06)', () => {
  const complete = {
    kybStatus: 'NOT_STARTED' as const,
    businessDetailsComplete: true,
    verifiedDocumentTypes: ['CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL'] as const,
    payoutAccountVerified: true,
  };

  it('needs the CAC certificate, a director ID and proof of address', () => {
    expect([...REQUIRED_KYB_DOCUMENTS]).toEqual(['CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL']);
  });

  it('is ready when details, all required documents and the payout account are in', () => {
    expect(kybSubmissionGaps(complete)).toEqual([]);
  });

  it('lists every missing item, documents by type', () => {
    expect(
      kybSubmissionGaps({
        kybStatus: 'NOT_STARTED',
        businessDetailsComplete: false,
        verifiedDocumentTypes: ['DIRECTOR_ID', 'OTHER'],
        payoutAccountVerified: false,
      }),
    ).toEqual(['BUSINESS_DETAILS', 'DOCUMENT_CAC_CERT', 'DOCUMENT_UTILITY_BILL', 'PAYOUT_ACCOUNT']);
  });

  it('counts each document type once, however many files were uploaded', () => {
    expect(
      kybSubmissionGaps({
        ...complete,
        verifiedDocumentTypes: ['CAC_CERT', 'CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL'],
      }),
    ).toEqual([]);
  });

  it('allows resubmission after a rejection, not while in review or approved', () => {
    expect(kybSubmissionGaps({ ...complete, kybStatus: 'REJECTED' })).toEqual([]);
    expect(kybSubmissionGaps({ ...complete, kybStatus: 'SUBMITTED' })).toEqual(['NOT_EDITABLE']);
    expect(kybSubmissionGaps({ ...complete, kybStatus: 'APPROVED' })).toEqual(['NOT_EDITABLE']);
  });
});

describe('accountNameMatches (doc 03 O-05: a different name needs admin review)', () => {
  it.each([
    ['EKO PARKING SERVICES LTD', 'Eko Parking Services Ltd'],
    ['EKO PARKING SERVICES LIMITED', 'Eko Parking Services Ltd.'],
    ['EKO PARKING SERVICES NIG LTD', 'Eko Parking Services Limited'],
    ['EKO PARKING SERVICES', 'Eko Parking Services Nigeria Limited'],
    ['ADEBAYO & SONS ENTERPRISES', 'Adebayo and Sons Enterprises'],
    ['EKO-PARKING SERVICES LTD', 'Eko Parking Services Ltd'],
  ])('%s ≈ %s', (bank, legal) => {
    expect(accountNameMatches(bank, legal)).toBe(true);
  });

  it.each([
    ['ADA OKAFOR', 'Eko Parking Services Ltd'],
    ['EKO PARKING', 'Eko Parking Services Ltd'],
    ['IKEJA PARKING SERVICES LTD', 'Eko Parking Services Ltd'],
    ['', 'Eko Parking Services Ltd'],
  ])('%s ≠ %s', (bank, legal) => {
    expect(accountNameMatches(bank, legal)).toBe(false);
  });
});

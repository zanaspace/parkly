/**
 * Operator KYB rules (FR-LOT-001, doc 03 §2.1). Pure: the API supplies the facts.
 */

export type KybDocumentType = 'CAC_CERT' | 'DIRECTOR_ID' | 'UTILITY_BILL' | 'OTHER';
export type KybStatus = 'NOT_STARTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

/** Doc 03 O-04: CAC certificate, director ID (NIN slip / passport / licence), proof of address. */
export const REQUIRED_KYB_DOCUMENTS = [
  'CAC_CERT',
  'DIRECTOR_ID',
  'UTILITY_BILL',
] as const satisfies readonly KybDocumentType[];

export type KybGap =
  | 'NOT_EDITABLE'
  | 'BUSINESS_DETAILS'
  | `DOCUMENT_${(typeof REQUIRED_KYB_DOCUMENTS)[number]}`
  | 'PAYOUT_ACCOUNT';

/** What still stops an operator submitting KYB; empty means it can be submitted. */
export function kybSubmissionGaps(input: {
  kybStatus: KybStatus;
  businessDetailsComplete: boolean;
  /** Types of documents whose upload passed the server-side checks. */
  verifiedDocumentTypes: readonly KybDocumentType[];
  payoutAccountVerified: boolean;
}): KybGap[] {
  if (input.kybStatus === 'SUBMITTED' || input.kybStatus === 'APPROVED') return ['NOT_EDITABLE'];
  const gaps: KybGap[] = [];
  if (!input.businessDetailsComplete) gaps.push('BUSINESS_DETAILS');
  const have = new Set(input.verifiedDocumentTypes);
  for (const type of REQUIRED_KYB_DOCUMENTS) if (!have.has(type)) gaps.push(`DOCUMENT_${type}`);
  if (!input.payoutAccountVerified) gaps.push('PAYOUT_ACCOUNT');
  return gaps;
}

// Company-form words banks add or drop freely; they do not identify the business.
const NOISE = new Set([
  'LTD',
  'LIMITED',
  'PLC',
  'NIG',
  'NIGERIA',
  'CO',
  'COMPANY',
  'THE',
  'AND',
  'INC',
]);

const words = (name: string) =>
  name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !NOISE.has(w));

/**
 * Whether the bank's account name is the operator's legal name, ignoring case,
 * punctuation and company-form words (Ltd/Limited/Nig/Plc…). Anything else is
 * flagged for ops to check before approving KYB (doc 03 O-05).
 */
export function accountNameMatches(accountName: string, legalName: string): boolean {
  const a = words(accountName);
  const b = words(legalName);
  return a.length > 0 && a.join(' ') === b.join(' ');
}

import type { KybDocumentType } from '@parkly/contracts';
import type { ApiProblem } from '../api';

/** Doc 03 O-04, in the order the page shows them. */
export const REQUIRED_DOCUMENTS = ['CAC_CERT', 'DIRECTOR_ID', 'UTILITY_BILL'] as const;

export const DOCUMENT_LABELS: Record<KybDocumentType, string> = {
  CAC_CERT: 'CAC certificate',
  DIRECTOR_ID: 'Director ID (NIN slip, passport or driver’s licence)',
  UTILITY_BILL: 'Proof of address (utility bill)',
  OTHER: 'Other supporting document',
};

const GAP_LABELS: Record<string, string> = {
  BUSINESS_DETAILS: 'Business details (CAC number, address, contact email and phone)',
  DOCUMENT_CAC_CERT: DOCUMENT_LABELS.CAC_CERT,
  DOCUMENT_DIRECTOR_ID: DOCUMENT_LABELS.DIRECTOR_ID,
  DOCUMENT_UTILITY_BILL: DOCUMENT_LABELS.UTILITY_BILL,
  PAYOUT_ACCOUNT: 'Bank account for payouts',
};

/** KYB_INCOMPLETE → the missing items, in the API's order. */
export function describeKybGaps(problem: ApiProblem): string[] {
  return (problem.errors ?? []).map((e) => GAP_LABELS[e.path] ?? e.path);
}

const UPLOAD_REJECTIONS: Record<string, string> = {
  MALWARE: 'This file was flagged by our virus scan, so we didn’t keep it.',
  TYPE_MISMATCH: 'This file is not a real PDF, JPG or PNG. Please export it again and retry.',
  SIZE_MISMATCH: 'The upload was incomplete. Please try again.',
  CHECKSUM_MISMATCH: 'The upload was incomplete. Please try again.',
  IMAGE_UNREADABLE: 'We couldn’t read this image. Try a clearer photo or a PDF.',
  EXPIRED: 'The upload took too long. Please try again.',
};

/** User-facing copy for the errors the KYB page can get (doc 04 voice: what to do next). */
export function kybProblemMessage(problem: ApiProblem): string {
  switch (problem.code) {
    case 'UPLOAD_REJECTED':
      return UPLOAD_REJECTIONS[problem.detail ?? ''] ?? 'We couldn’t accept this file.';
    case 'UPLOAD_TYPE_NOT_ALLOWED':
      return 'Upload a PDF, JPG or PNG file up to 10 MB.';
    case 'UPLOAD_NOT_RECEIVED':
      return 'The file didn’t finish uploading. Please try again.';
    case 'PAYOUT_ACCOUNT_UNRESOLVED':
      return 'We couldn’t find that account. Check the bank and the 10-digit account number.';
    case 'PAYMENT_PROVIDER_UNAVAILABLE':
      return 'The bank check isn’t responding right now. Please try again in a few minutes.';
    case 'INVALID_STATE_TRANSITION':
      return 'Your KYB has been submitted, so these details are locked until the review is done.';
    case 'VALIDATION_FAILED':
      return problem.errors?.[0]?.message ?? 'Please check what you entered.';
    default:
      return 'Something went wrong. Please try again in a moment.';
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

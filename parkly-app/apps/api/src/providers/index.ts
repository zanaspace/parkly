/**
 * Every external service is reached through one of these interfaces (doc 00
 * §3.10 rule 6). Real adapters arrive with the sprint that needs them; tests
 * always use the fakes in ./fakes.ts.
 */

export interface Clock {
  now(): Date;
}

/** A charge as the provider reports it on verify (never trust a webhook body alone). */
export type VerifiedCharge = {
  /** Provider status as given: success, failed, reversed, abandoned, ongoing, pending, … */
  status: string;
  amountKobo: number;
  currency: string;
  paidAt: Date | null;
  feesKobo: number | null;
  channel: string | null;
  /** Only the last four digits and the brand: never more card data (doc 06). */
  cardLast4: string | null;
  cardBrand: string | null;
};

/** A transaction as reported by the provider list API for daily reconciliation (doc 02 §2.7). */
export type ProviderTransaction = {
  reference: string;
  amountKobo: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  feesKobo: number | null;
  channel: string | null;
};

export interface PaymentProvider {
  readonly name: 'paystack' | 'flutterwave' | 'fake';
  initialize(input: {
    reference: string;
    amountKobo: number;
    email: string;
    /** The operator's subaccount; null only outside prod (demo lots have none). */
    subaccountCode: string | null;
    /** Parkly's share (commission + service fee), kept by the split (`transaction_charge`). */
    platformShareKobo: number;
    /** Where the provider sends the driver after paying. */
    callbackUrl: string | null;
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string; accessCode: string }>;
  /** Null when the provider does not know the reference. */
  verify(reference: string): Promise<VerifiedCharge | null>;
  refund(input: {
    reference: string;
    amountKobo: number;
  }): Promise<{ refundId: string; status: 'PENDING' | 'PROCESSED' }>;
  /** Checks the webhook signature over the exact raw body. */
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
  /** Transactions in [from, to] for daily reconciliation (doc 02 §2.7). */
  listTransactions(input: { from: Date; to: Date; page?: number; perPage?: number }): Promise<{
    items: ProviderTransaction[];
    total: number;
  }>;
}

export interface SmsProvider {
  readonly name: string;
  send(input: {
    to: string;
    body: string;
    kind: 'OTP' | 'TRANSACTIONAL';
  }): Promise<{ providerMessageId: string }>;
}

export interface PushProvider {
  send(input: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<{
    delivered: number;
    invalidTokens: string[];
  }>;
}

export interface EmailProvider {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    /** E.g. the receipt PDF on a booking confirmation (FR-BOOK-009). */
    attachments?: { filename: string; contentType: string; content: Uint8Array }[];
  }): Promise<{ providerMessageId: string }>;
}

/** A place suggestion; providers that return coordinates up front include them. */
export type PlaceSuggestion = {
  placeId: string;
  /** Main line, e.g. "Eko Hotel". */
  label: string;
  /** Second line, e.g. "Adetokunbo Ademola Street, Victoria Island". */
  detail: string;
  location: { lat: number; lng: number } | null;
};

/**
 * Address search (ADR 0014: LocationIQ now; a Google adapter can implement
 * the same interface). Suggestions stay within Lagos State.
 */
export interface MapsProvider {
  autocomplete(input: { query: string; sessionToken: string }): Promise<PlaceSuggestion[]>;
  placeDetails(input: { placeId: string; sessionToken: string }): Promise<{
    lat: number;
    lng: number;
    formattedAddress: string;
  }>;
}

export type Bucket =
  | 'kyb-docs'
  | 'permits'
  | 'verification'
  | 'incident-evidence'
  | 'lot-photos'
  | 'lot-photos-public'
  | 'exports';

export interface StorageProvider {
  /** Single-use URL the client PUTs the file to; the API fixes the path (doc 05 V12). */
  createSignedUploadUrl(input: {
    bucket: Bucket;
    path: string;
  }): Promise<{ url: string; token: string }>;
  createSignedDownloadUrl(input: {
    bucket: Bucket;
    path: string;
    expiresInSec: number;
  }): Promise<string>;
  /** Server-side read, used to re-check an upload. Null when the object does not exist. */
  download(input: { bucket: Bucket; path: string }): Promise<Uint8Array | null>;
  /** Server-side write (re-encoded images, copies to the public bucket). Overwrites. */
  upload(input: {
    bucket: Bucket;
    path: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<void>;
  remove(input: { bucket: Bucket; paths: string[] }): Promise<void>;
  /** Permanent CDN link; only the public bucket of approved lot photos (C1, doc 06). */
  publicUrl(input: { bucket: 'lot-photos-public'; path: string }): string;
}

export type Bank = { code: string; name: string };

/**
 * Operator settlement accounts (doc 02 §2.3). Paystack resolves the account
 * name and holds the bank details; we keep only the subaccount code.
 */
/**
 * One provider payout (S7 task 3), read strictly. Only SETTLED rows with an
 * amount are posted to the ledger; NEEDS_REVIEW says why the record could not
 * be trusted (unknown status, missing amount, other currency).
 */
export type ProviderSettlement = {
  id: string;
  status: 'PENDING' | 'SETTLED' | 'FAILED' | 'NEEDS_REVIEW';
  /** Paid out, after the provider's deductions (kobo). */
  amountKobo: number | null;
  grossKobo: number | null;
  feesKobo: number | null;
  settledAt: Date | null;
  /** Null for Parkly's main account. */
  subaccountCode: string | null;
  reviewReason: string | null;
  /** The money fields as received; never bank account numbers. */
  raw: Record<string, unknown>;
};

export interface SettlementProvider {
  readonly name: 'paystack' | 'fake';
  listBanks(): Promise<Bank[]>;
  /** Null when the provider cannot resolve the account (wrong number or bank). */
  resolveAccount(input: {
    bankCode: string;
    accountNumber: string;
  }): Promise<{ accountName: string } | null>;
  createSubaccount(input: {
    businessName: string;
    bankCode: string;
    accountNumber: string;
    /** Parkly's default share, in percent (commission_bps / 100). */
    percentageCharge: number;
    contactEmail: string | null;
  }): Promise<{ subaccountCode: string }>;
  /**
   * Payouts in [from, to] for Parkly's main account (`subaccount: null`) or one
   * operator subaccount, one page at a time (pages start at 1).
   */
  listSettlements(input: {
    subaccount: string | null;
    from: Date;
    to: Date;
    page: number;
    perPage: number;
  }): Promise<{
    items: ProviderSettlement[];
    pageCount: number;
    /** Records with no id, which can't be stored; the job reports them. */
    unreadable: number;
  }>;
}

/** Virus scan for uploaded PDFs (doc 05 V12). Provider chosen in ADR 0013. */
export interface MalwareScanner {
  readonly name: string;
  scan(input: {
    bytes: Uint8Array;
    filename: string;
  }): Promise<{ clean: boolean; threat?: string }>;
}

/**
 * Tier 2 KYC Driver Identity Verification provider (FR-AUTH-009):
 * verifies FRSC Driver's License (license number + DOB) or NIN phone-match.
 */
export type IdentityVerificationOutcome = {
  verified: boolean;
  providerReference: string;
  verifiedName: string | null;
  rejectionReason: string | null;
};

export interface IdentityVerificationProvider {
  readonly name: 'dojah' | 'fake';
  verifyDriver(input: {
    method: 'FRSC_LICENSE' | 'NIN_PHONE';
    idNumber: string;
    dateOfBirth?: string;
    phoneLast4?: string | null;
  }): Promise<IdentityVerificationOutcome>;
}

/**
 * Every external service is reached through one of these interfaces (doc 00
 * §3.10 rule 6). Real adapters arrive with the sprint that needs them; tests
 * always use the fakes in ./fakes.ts.
 */

export interface Clock {
  now(): Date;
}

export type PaymentStatus = 'SUCCEEDED' | 'FAILED' | 'ABANDONED' | 'PENDING';

export interface PaymentProvider {
  readonly name: 'paystack' | 'flutterwave' | 'fake';
  initialize(input: {
    reference: string;
    amountKobo: number;
    email: string;
    subaccountCode: string;
    /** Parkly's share (commission + service fee), deducted by the split. */
    platformShareKobo: number;
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string; accessCode: string; reference: string }>;
  verify(
    reference: string,
  ): Promise<{ status: PaymentStatus; amountKobo: number; paidAt: Date | null }>;
  refund(input: {
    reference: string;
    amountKobo: number;
  }): Promise<{ refundId: string; status: 'PENDING' | 'PROCESSED' }>;
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
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
}

/** Virus scan for uploaded PDFs (doc 05 V12). Provider chosen in ADR 0013. */
export interface MalwareScanner {
  readonly name: string;
  scan(input: {
    bytes: Uint8Array;
    filename: string;
  }): Promise<{ clean: boolean; threat?: string }>;
}

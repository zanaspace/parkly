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

export interface MapsProvider {
  autocomplete(input: {
    query: string;
    sessionToken: string;
  }): Promise<{ placeId: string; description: string }[]>;
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
  createSignedUploadUrl(input: {
    bucket: Bucket;
    path: string;
  }): Promise<{ url: string; token: string }>;
  createSignedDownloadUrl(input: {
    bucket: Bucket;
    path: string;
    expiresInSec: number;
  }): Promise<string>;
  remove(input: { bucket: Bucket; paths: string[] }): Promise<void>;
}

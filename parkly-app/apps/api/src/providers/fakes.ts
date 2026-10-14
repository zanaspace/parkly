import type {
  Bucket,
  Clock,
  EmailProvider,
  MapsProvider,
  PaymentProvider,
  PaymentStatus,
  PushProvider,
  SmsProvider,
  StorageProvider,
} from './index.js';

/** In-memory fakes. They record calls so tests can assert on side effects. */

export class FakeClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  readonly initialized: Parameters<PaymentProvider['initialize']>[0][] = [];
  readonly refunds: { reference: string; amountKobo: number }[] = [];
  /** Tests set the outcome a later verify() should report. */
  readonly outcomes = new Map<string, PaymentStatus>();
  webhookSecretValid = true;

  async initialize(input: Parameters<PaymentProvider['initialize']>[0]) {
    this.initialized.push(input);
    return {
      authorizationUrl: `https://checkout.fake/${input.reference}`,
      accessCode: `ac_${input.reference}`,
      reference: input.reference,
    };
  }
  async verify(reference: string) {
    const init = this.initialized.find((i) => i.reference === reference);
    const status = this.outcomes.get(reference) ?? 'PENDING';
    return {
      status,
      amountKobo: init?.amountKobo ?? 0,
      paidAt: status === 'SUCCEEDED' ? new Date(0) : null,
    };
  }
  async refund(input: { reference: string; amountKobo: number }) {
    this.refunds.push(input);
    return { refundId: `rf_${this.refunds.length}`, status: 'PENDING' as const };
  }
  verifyWebhook(_rawBody: string, signature: string | undefined) {
    return this.webhookSecretValid && signature === 'valid';
  }
}

export class FakeSmsProvider implements SmsProvider {
  readonly name = 'fake';
  readonly sent: Parameters<SmsProvider['send']>[0][] = [];
  failNext = false;
  async send(input: Parameters<SmsProvider['send']>[0]) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake sms failure');
    }
    this.sent.push(input);
    return { providerMessageId: `sms_${this.sent.length}` };
  }
}

export class FakePushProvider implements PushProvider {
  readonly sent: Parameters<PushProvider['send']>[0][] = [];
  readonly invalid = new Set<string>();
  async send(input: Parameters<PushProvider['send']>[0]) {
    this.sent.push(input);
    const invalidTokens = input.tokens.filter((t) => this.invalid.has(t));
    return { delivered: input.tokens.length - invalidTokens.length, invalidTokens };
  }
}

export class FakeEmailProvider implements EmailProvider {
  readonly sent: Parameters<EmailProvider['send']>[0][] = [];
  async send(input: Parameters<EmailProvider['send']>[0]) {
    this.sent.push(input);
    return { providerMessageId: `email_${this.sent.length}` };
  }
}

/** Seeded with Victoria Island so local search has somewhere to look. */
export class FakeMapsProvider implements MapsProvider {
  readonly places = new Map([
    ['fake-vi', { lat: 6.4281, lng: 3.4219, formattedAddress: 'Victoria Island, Lagos' }],
  ]);
  async autocomplete(input: { query: string }) {
    const q = input.query.toLowerCase();
    return [...this.places.entries()]
      .filter(([, p]) => p.formattedAddress.toLowerCase().includes(q))
      .map(([placeId, p]) => ({ placeId, description: p.formattedAddress }));
  }
  async placeDetails(input: { placeId: string }) {
    const place = this.places.get(input.placeId);
    if (!place) throw new Error(`unknown place ${input.placeId}`);
    return place;
  }
}

export class FakeStorageProvider implements StorageProvider {
  readonly objects = new Set<string>();
  async createSignedUploadUrl(input: { bucket: Bucket; path: string }) {
    this.objects.add(`${input.bucket}/${input.path}`);
    return {
      url: `https://storage.fake/upload/${input.bucket}/${input.path}`,
      token: 'upload-token',
    };
  }
  async createSignedDownloadUrl(input: { bucket: Bucket; path: string; expiresInSec: number }) {
    return `https://storage.fake/${input.bucket}/${input.path}?expires=${input.expiresInSec}`;
  }
  async remove(input: { bucket: Bucket; paths: string[] }) {
    for (const p of input.paths) this.objects.delete(`${input.bucket}/${p}`);
  }
}

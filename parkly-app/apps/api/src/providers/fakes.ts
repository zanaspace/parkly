import type {
  Bank,
  Bucket,
  Clock,
  EmailProvider,
  MalwareScanner,
  MapsProvider,
  PaymentProvider,
  PushProvider,
  SettlementProvider,
  SmsProvider,
  StorageProvider,
  VerifiedCharge,
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
  /** Tests set what a later verify() reports; unset references are 'ongoing'. */
  readonly outcomes = new Map<string, Partial<VerifiedCharge>>();
  failInitialize = false;

  async initialize(input: Parameters<PaymentProvider['initialize']>[0]) {
    if (this.failInitialize) throw new Error('fake initialize failure');
    this.initialized.push(input);
    return {
      authorizationUrl: `https://checkout.fake/${input.reference}`,
      accessCode: `ac_${input.reference}`,
    };
  }
  /** Marks a reference as paid in full, as Paystack would report it. */
  pay(reference: string, over: Partial<VerifiedCharge> = {}) {
    this.outcomes.set(reference, { status: 'success', ...over });
  }
  async verify(reference: string): Promise<VerifiedCharge | null> {
    const init = this.initialized.find((i) => i.reference === reference);
    if (!init) return null;
    const outcome = this.outcomes.get(reference) ?? {};
    const status = outcome.status ?? 'ongoing';
    return {
      status,
      amountKobo: init.amountKobo,
      currency: 'NGN',
      paidAt: status === 'success' ? new Date(0) : null,
      feesKobo: status === 'success' ? 1_500 : null,
      channel: status === 'success' ? 'card' : null,
      cardLast4: status === 'success' ? '4081' : null,
      cardBrand: status === 'success' ? 'visa' : null,
      ...outcome,
    };
  }
  async refund(input: { reference: string; amountKobo: number }) {
    this.refunds.push(input);
    return { refundId: `rf_${this.refunds.length}`, status: 'PENDING' as const };
  }
  /** Signature "valid" is accepted; anything else is not. */
  verifyWebhook(_rawBody: string, signature: string | undefined) {
    return signature === 'valid';
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
    [
      'fake-eko',
      { lat: 6.4247, lng: 3.4284, formattedAddress: 'Eko Hotel, Victoria Island, Lagos' },
    ],
    ['fake-ikoyi', { lat: 6.452, lng: 3.435, formattedAddress: 'Ikoyi, Lagos' }],
    ['fake-lekki', { lat: 6.4474, lng: 3.472, formattedAddress: 'Lekki Phase 1, Lagos' }],
    ['fake-ikeja', { lat: 6.5806, lng: 3.3567, formattedAddress: 'Ikeja GRA, Lagos' }],
  ]);
  async autocomplete(input: { query: string }) {
    const q = input.query.toLowerCase();
    return [...this.places.entries()]
      .filter(([, p]) => p.formattedAddress.toLowerCase().includes(q))
      .map(([placeId, p]) => {
        const [label = '', ...rest] = p.formattedAddress.split(', ');
        return { placeId, label, detail: rest.join(', '), location: { lat: p.lat, lng: p.lng } };
      });
  }
  async placeDetails(input: { placeId: string }) {
    const place = this.places.get(input.placeId);
    if (!place) throw new Error(`unknown place ${input.placeId}`);
    return place;
  }
}

/** Holds objects in memory. Tests call `put()` to play the client's direct upload. */
export class FakeStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  readonly signedUploads: string[] = [];
  put(bucket: Bucket, path: string, body: Uint8Array, contentType = 'application/octet-stream') {
    this.objects.set(`${bucket}/${path}`, { body, contentType });
  }
  async createSignedUploadUrl(input: { bucket: Bucket; path: string }) {
    this.signedUploads.push(`${input.bucket}/${input.path}`);
    return {
      url: `https://storage.fake/upload/${input.bucket}/${input.path}?token=upload-token`,
      token: 'upload-token',
    };
  }
  publicUrl(input: { bucket: 'lot-photos-public'; path: string }) {
    return `https://storage.fake/public/${input.bucket}/${input.path}`;
  }

  async createSignedDownloadUrl(input: { bucket: Bucket; path: string; expiresInSec: number }) {
    return `https://storage.fake/${input.bucket}/${input.path}?expires=${input.expiresInSec}`;
  }
  async download(input: { bucket: Bucket; path: string }) {
    return this.objects.get(`${input.bucket}/${input.path}`)?.body ?? null;
  }
  async upload(input: { bucket: Bucket; path: string; body: Uint8Array; contentType: string }) {
    this.put(input.bucket, input.path, input.body, input.contentType);
  }
  async remove(input: { bucket: Bucket; paths: string[] }) {
    for (const p of input.paths) this.objects.delete(`${input.bucket}/${p}`);
  }
}

/** Account numbers listed in `accounts` resolve; everything else does not. */
export class FakeSettlementProvider implements SettlementProvider {
  readonly name = 'fake' as const;
  readonly banks: Bank[] = [
    { code: '044', name: 'Access Bank' },
    { code: '058', name: 'Guaranty Trust Bank' },
    { code: '057', name: 'Zenith Bank' },
  ];
  readonly accounts = new Map<string, string>([['058:0123456789', 'EKO PARKING SERVICES LTD']]);
  readonly subaccounts: Parameters<SettlementProvider['createSubaccount']>[0][] = [];
  failNext = false;
  async listBanks() {
    return [...this.banks];
  }
  async resolveAccount(input: { bankCode: string; accountNumber: string }) {
    this.maybeFail();
    const accountName = this.accounts.get(`${input.bankCode}:${input.accountNumber}`);
    return accountName ? { accountName } : null;
  }
  async createSubaccount(input: Parameters<SettlementProvider['createSubaccount']>[0]) {
    this.maybeFail();
    this.subaccounts.push(input);
    return { subaccountCode: `ACCT_fake${this.subaccounts.length}` };
  }
  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake settlement provider unavailable');
    }
  }
}

/** Flags the EICAR test string, like real scanners do. */
export class FakeMalwareScanner implements MalwareScanner {
  readonly name = 'fake';
  readonly scanned: string[] = [];
  async scan(input: { bytes: Uint8Array; filename: string }) {
    this.scanned.push(input.filename);
    const text = Buffer.from(input.bytes).toString('latin1');
    return text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')
      ? { clean: false, threat: 'EICAR-Test-File' }
      : { clean: true };
  }
}

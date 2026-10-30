import type { RoleGrant } from '@parkly/domain/authz';
import type { BookingStatus, ConfirmDecision, PaymentStatus } from '@parkly/domain/booking';
import type { Bucket, VerifiedCharge } from '../providers/index.js';

/**
 * Everything the API reads or writes in Postgres goes through this interface.
 * Production: DrizzleStore. Route tests: MemoryStore (same behaviour, no DB).
 * Scoping rules live in the callers' `can()` checks and in each method's
 * userId/operatorId parameters (doc 05 §5.2 rule 2).
 */

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
export type ConsentType = 'TERMS' | 'PRIVACY' | 'MARKETING' | 'LOCATION' | 'OPERATOR_AGREEMENT';
export type Platform = 'ANDROID' | 'IOS' | 'WEB' | 'PWA';

/** A stored receipt (FR-BOOK-009); `content` is the frozen receipt body. */
export type ReceiptRow = {
  bookingId: string;
  operatorId: string;
  number: string;
  revision: number;
  issuedAt: Date;
  revisedAt: Date;
  content: unknown;
};

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

/** One queued notification (ADR 0020). `payload` is the event the templates render. */
export type NotificationRow = {
  id: string;
  userId: string;
  bookingId: string | null;
  eventKey: string;
  dedupeKey: string;
  payload: unknown;
  status: NotificationStatus;
  channelsDone: string[];
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
};

/** A booking due a reminder or a no-show notice that hasn't been queued yet. */
export type ReminderCandidate = {
  kind: 'START' | 'END' | 'NO_SHOW';
  bookingId: string;
  driverId: string;
  bookingCode: string;
  lotName: string;
  startAt: Date;
  endAt: Date;
};

export type UserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneLast4: string | null;
  status: UserStatus;
  marketingOptIn: boolean;
};

export type VehicleRow = {
  id: string;
  userId: string;
  plateRaw: string;
  plateNorm: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  isDefault: boolean;
};

export type FileRow = {
  id: string;
  bucket: Bucket;
  path: string;
  dataClass: 'C1' | 'C2' | 'C3' | 'C4';
  retentionPolicy: string;
  ownerEntityType: string;
  ownerEntityId: string;
  uploadedBy: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  mime: string;
  sizeBytes: number;
  sha256: Buffer;
  rejectionReason: string | null;
  verifiedAt: Date | null;
  /** Set by the caller from its clock: the upload window is measured from it. */
  createdAt: Date;
};

export type OperatorType = 'HOTEL' | 'OFFICE' | 'COMMERCIAL_LOT' | 'EVENT_CENTRE' | 'OTHER';

/** `*Enc` fields hold app-level ciphertext (FieldCrypto); the store never sees plaintext. */
export type OperatorDetails = {
  legalName: string;
  tradingName: string;
  type: OperatorType;
  cacNumberEnc: string | null;
  tinEnc: string | null;
  addressLine: string | null;
  contactEmail: string | null;
  contactPhoneEnc: string | null;
};

export type OperatorRow = OperatorDetails & {
  id: string;
  status: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  kybStatus: 'NOT_STARTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  kybSubmittedAt: Date | null;
  kybRejectionReason: string | null;
  commissionBps: number;
  createdAt: Date;
};

export type KybDocumentType = 'CAC_CERT' | 'DIRECTOR_ID' | 'UTILITY_BILL' | 'OTHER';
export type ReviewStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export type KybDocumentRow = {
  id: string;
  operatorId: string;
  type: KybDocumentType;
  fileId: string;
  status: ReviewStatus;
  rejectionReason: string | null;
  createdAt: Date;
};

/** Doc 06 §3.5: masked number + resolved name; the full number only until the subaccount exists. */
export type PayoutAccountRow = {
  operatorId: string;
  bankCode: string;
  bankName: string;
  accountNumberLast4: string;
  accountName: string;
  pendingAccountNumberEnc: string | null;
  nameMismatch: boolean;
  providerSubaccountCode: string | null;
  status: 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'DISABLED';
  verifiedAt: Date | null;
};

export type LotStatus =
  'DRAFT' | 'PENDING_VERIFICATION' | 'LIVE' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED';

export type LotFields = {
  type: OperatorType;
  name: string;
  description: string | null;
  addressLine: string;
  area: string | null;
  lga: string | null;
  location: { lat: number; lng: number };
  entranceNotes: string | null;
  capacityTotal: number;
  capacityBookable: number;
  amenities: string[];
  vehicleTypes: string[];
};

export type LotRow = LotFields & {
  id: string;
  operatorId: string;
  slug: string;
  status: LotStatus;
  statusReason: string | null;
  /** Drivers may check themselves in with the entrance QR (ADR 0016). */
  selfCheckinEnabled: boolean;
  version: number;
  createdAt: Date;
};

/**
 * A lot drivers may see (doc 00 non-negotiable 2): LIVE, operator active with
 * KYB approved, an APPROVED permit and an APPROVED verification both still
 * valid on the Lagos date given.
 */
export type LiveLotRow = LotRow & { operatorName: string; commissionBps: number };

/** `HH:MM` in Africa/Lagos; both null when `is24h`. */
export type OpeningHourRow = {
  weekday: number;
  is24h: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type LotPhotoRow = {
  id: string;
  lotId: string;
  fileId: string;
  /** The copy in `lot-photos-public`, made when the photo is approved. */
  publicFileId: string | null;
  sort: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
};

export type PermitRow = {
  id: string;
  lotId: string;
  issuer: string;
  permitNumber: string;
  /** YYYY-MM-DD, Lagos calendar days. */
  issuedAt: string;
  expiresAt: string;
  documentFileId: string | null;
  status: 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  rejectionReason: string | null;
  /** How ops checked it with LASPA (internal). */
  reviewNote: string | null;
  /** The last expiry reminder sent (30/14/7/1 days before), FR-LOT-007. */
  lastReminderDays: number | null;
  createdAt: Date;
};

export type VerificationItemName =
  | 'LASPA_PERMIT'
  | 'GUARD_PRESENCE'
  | 'LIGHTING'
  | 'CCTV'
  | 'ACCESS_CONTROL'
  | 'CAPACITY_COUNT'
  | 'OWNER_IDENTITY'
  | 'ENTRANCE_SIGNAGE'
  | 'FIRE_SAFETY';

export type VerificationItemRow = {
  item: VerificationItemName;
  result: 'PASS' | 'FAIL' | 'NA';
  comment: string | null;
};

export type VerificationRow = {
  id: string;
  lotId: string;
  inspectorUserId: string;
  inspectedAt: Date;
  status: 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  capacityCounted: number;
  gps: { lat: number; lng: number } | null;
  notes: string | null;
  /** YYYY-MM-DD, Lagos calendar day. */
  validUntil: string;
  rejectionReason: string | null;
  items: VerificationItemRow[];
  createdAt: Date;
};

/** Who decided and when; a rejection carries the reason the operator sees. */
export type Review = { reviewerId: string; at: Date };

export type Product = 'HOURLY' | 'DAILY' | 'MONTHLY';

export type RatePlanPrices = {
  hourlyRateKobo: number | null;
  minMinutes: number;
  dailyCapKobo: number | null;
  dailyRateKobo: number | null;
  monthlyRateKobo: number | null;
  /** Hourly plans: overstay price per 15 minutes (ADR 0016); null = hourly ÷ 4. */
  overstayRateKobo?: number | null;
  /** Hourly plans: grace after the end; null = the platform's. */
  overstayGraceMin?: number | null;
};

export type RatePlanRow = RatePlanPrices & {
  id: string;
  lotId: string;
  product: Product;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'RETIRED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: Date;
};

export type MemberRow = {
  id: string;
  operatorId: string;
  /** Null until the invite is accepted. */
  userId: string | null;
  role: 'OWNER' | 'MANAGER' | 'ATTENDANT';
  /** Attendants: lots they work; empty = every lot of the operator. */
  lotIds: string[];
  status: 'INVITED' | 'ACTIVE' | 'REMOVED';
  inviteeName: string | null;
  inviteExpiresAt: Date | null;
  invitedBy: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
};

/** One lot_slot_inventory row (doc 02 §2.5). */
export type SlotRow = {
  lotId: string;
  slotStart: Date;
  capacity: number;
  booked: number;
  held: number;
  passReserved: number;
  blocked: number;
};

export type BookingRow = {
  id: string;
  code: string;
  driverId: string;
  vehicleId: string;
  plateNorm: string;
  lotId: string;
  product: 'HOURLY' | 'DAILY';
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  holdExpiresAt: Date | null;
  priceKobo: number;
  serviceFeeKobo: number;
  totalKobo: number;
  commissionBps: number;
  ratePlanId: string;
  /** The domain quote lines, as priced when booked. */
  pricingBreakdown: unknown;
  source: 'MOBILE' | 'WEB' | 'ADMIN';
  createdAt: Date;
};

export type NewBooking = Omit<
  BookingRow,
  'status' | 'totalKobo' | 'createdAt' | 'holdExpiresAt'
> & {
  holdExpiresAt: Date;
};

export type BookingExtensionRow = {
  id: string;
  bookingId: string;
  startAt: Date;
  newEndAt: Date;
  addedMinutes: number;
  priceKobo: number;
  platformAmountKobo: number;
  operatorAmountKobo: number;
  paymentId: string | null;
  status: BookingStatus;
  createdAt: Date;
};

export type PaymentRow = {
  /** Also the provider reference. */
  id: string;
  kind?: 'BOOKING' | 'EXTENSION' | 'OVERSTAY' | 'PASS';
  bookingId: string | null;
  payerUserId: string;
  provider: 'PAYSTACK' | 'FAKE';
  status: PaymentStatus;
  amountKobo: number;
  platformAmountKobo: number;
  operatorAmountKobo: number;
  operatorId: string;
  subaccountCode: string | null;
  authorizationUrl: string | null;
  paidAt: Date | null;
  failureCode: string | null;
  channel?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  feesKobo?: number | null;
  createdAt: Date;
};

export type NewPayment = Pick<
  PaymentRow,
  | 'id'
  | 'payerUserId'
  | 'provider'
  | 'amountKobo'
  | 'platformAmountKobo'
  | 'operatorAmountKobo'
  | 'operatorId'
  | 'subaccountCode'
> & { kind?: 'BOOKING' | 'EXTENSION' | 'OVERSTAY' | 'PASS' };

export type SettleResult = {
  decision: ConfirmDecision;
  booking: BookingRow;
  payment: PaymentRow;
  /** A refund row created by this settlement; the caller asks the provider for it. */
  refund: { id: string; amountKobo: number } | null;
};

export type RefundRow = {
  id: string;
  paymentId: string;
  amountKobo: number;
  reason:
    | 'DRIVER_CANCEL'
    | 'HOLD_EXPIRED'
    | 'LOT_UNAVAILABLE'
    | 'OPS_GOODWILL'
    | 'DUPLICATE'
    | 'PERMIT_SUSPENSION'
    | 'OTHER';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  providerRefundId: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  note: string | null;
  createdAt: Date;
};

export type IdempotencyBegin =
  | { state: 'new' }
  | { state: 'replay'; status: number; body: unknown }
  | { state: 'in_progress' }
  | { state: 'mismatch' };

/** An attendant phone (the `devices` row with operator and lot set). */
export type AttendDeviceRow = {
  id: string;
  userId: string;
  clientDeviceId: string;
  operatorId: string;
  lotId: string;
  approvedAt: Date | null;
  revokedAt: Date | null;
  lastSeenAt: Date;
};

export type ManifestRow = {
  id: string;
  code: string;
  plateNorm: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
};

export type AttendEventInput =
  | {
      type: 'CHECK_IN';
      clientEventId: string;
      deviceTime: Date;
      bookingId: string;
      /** SELF: the driver scanned the entrance QR (ADR 0016). */
      method: 'QR' | 'CODE' | 'PLATE' | 'SELF';
      plateSeen: string | null;
      overrideReason: string | null;
    }
  | {
      type: 'CHECK_OUT';
      clientEventId: string;
      deviceTime: Date;
      bookingId: string;
      /** SELF: the driver scanned the entrance QR (ADR 0016). */
      method: 'QR' | 'CODE' | 'PLATE' | 'SELF';
    }
  | { type: 'WALK_IN'; clientEventId: string; deviceTime: Date; delta: 1 | -1 }
  | {
      type: 'ISSUE';
      clientEventId: string;
      deviceTime: Date;
      note: string;
      bookingId: string | null;
    };

export type AttendEventResult = {
  clientEventId: string;
  result: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
  reason: string | null;
};

export type StaySummary = {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  overstayMinutes: number;
  overstayAmountKobo: number;
  overstayStatus: 'NONE' | 'DUE' | 'PAID' | 'UNPAID' | 'WAIVED';
};

export type AttendBatch = {
  id: string;
  deviceId: string;
  lotId: string;
  attendantId: string;
  deviceSentAt: Date;
  receivedAt: Date;
  /**
   * From a phone a manager blocked: every event is kept as REJECTED
   * (DEVICE_REVOKED) for ops to review, and none is applied (gap review G-6).
   */
  quarantine?: boolean;
};

export type AuditEntry = {
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  ipHash: Buffer | null;
  userAgent: string | null;
  requestId: string | null;
};

export type AuditRow = AuditEntry & { id: string; createdAt: Date };

export type Store = {
  users: {
    find(id: string): Promise<UserRow | null>;
    /** Creates the profile if the auth trigger has not (e.g. staff invited before Sprint 1). */
    ensure(
      id: string,
      init: { phoneLast4: string | null },
    ): Promise<{ user: UserRow; created: boolean }>;
    /** Lookup hashes and the encrypted contact copy, from the signed-in identity. */
    setContact(
      id: string,
      contact: {
        phoneHash: Buffer | null;
        emailHash: Buffer | null;
        phoneEnc: string | null;
        emailEnc: string | null;
      },
    ): Promise<void>;
    /** The encrypted contact copy for sending notifications; null for an unknown user. */
    contact(id: string): Promise<{ phoneEnc: string | null; emailEnc: string | null } | null>;
    updateProfile(id: string, patch: { firstName?: string; lastName?: string }): Promise<UserRow>;
    setStatus(id: string, status: UserStatus): Promise<void>;
    setMarketingOptIn(id: string, value: boolean): Promise<void>;
    roles(id: string): Promise<RoleGrant[]>;
    /** Makes the user a driver (no-op if already). Self-service, like phone sign-up. */
    addDriverRole(id: string): Promise<void>;
  };
  consents: {
    add(entry: {
      userId: string;
      type: ConsentType;
      version: string;
      granted: boolean;
      ipHash: Buffer | null;
    }): Promise<void>;
    /** Latest decision per type. */
    latest(
      userId: string,
    ): Promise<Partial<Record<ConsentType, { version: string; granted: boolean }>>>;
  };
  vehicles: {
    list(userId: string): Promise<VehicleRow[]>;
    find(userId: string, id: string): Promise<VehicleRow | null>;
    /** Throws DuplicatePlateError when the normalised plate is already active for this user. */
    create(row: Omit<VehicleRow, 'id'>): Promise<VehicleRow>;
    update(
      userId: string,
      id: string,
      patch: Partial<Pick<VehicleRow, 'make' | 'model' | 'colour'>>,
    ): Promise<VehicleRow>;
    /** Makes this vehicle the only default for the user (atomic). */
    setDefault(userId: string, id: string): Promise<void>;
    /** Soft-deletes; if it was the default, the oldest remaining vehicle becomes default. */
    remove(userId: string, id: string): Promise<void>;
  };
  devices: {
    upsert(row: {
      userId: string;
      clientDeviceId: string;
      platform: Platform;
      appVersion: string | null;
      authSessionId: string | null;
      pushTokenEnc?: string | null;
    }): Promise<void>;
    revokeBySession(userId: string, authSessionId: string): Promise<void>;
    revokeAll(userId: string): Promise<void>;
    /** Encrypted push tokens on the user's signed-in (not revoked) devices. */
    pushTokens(userId: string): Promise<string[]>;
  };
  sessions: {
    /** Ends every Supabase Auth session the user has; access tokens still expire within 15 min. */
    revokeAll(userId: string): Promise<void>;
  };
  dataRequests: {
    /** Throws DsrAlreadyOpenError if one is open. */
    createDeletion(userId: string, dueAt: Date): Promise<{ id: string }>;
  };
  files: {
    create(row: Omit<FileRow, 'status' | 'rejectionReason' | 'verifiedAt'>): Promise<FileRow>;
    find(id: string): Promise<FileRow | null>;
    /** The stored object passed the checks; mime/size/sha256 describe it as stored (e.g. after re-encoding). */
    markVerified(
      id: string,
      stored: { mime: string; sizeBytes: number; sha256: Buffer },
      at: Date,
    ): Promise<void>;
    markRejected(id: string, reason: string): Promise<void>;
  };
  kybDocuments: {
    create(row: {
      operatorId: string;
      type: KybDocumentType;
      fileId: string;
    }): Promise<KybDocumentRow>;
    /** Newest first, with the stored file's type, size and check status. */
    list(
      operatorId: string,
    ): Promise<
      (KybDocumentRow & { mime: string; sizeBytes: number; fileStatus: FileRow['status'] })[]
    >;
    find(operatorId: string, id: string): Promise<KybDocumentRow | null>;
    /** Deletes the document and marks its file REJECTED (DELETED) so retention can sweep it. */
    remove(operatorId: string, id: string): Promise<void>;
  };
  payoutAccounts: {
    /** One per operator: replaces the previous account (status VERIFIED, no subaccount yet). */
    upsert(
      row: Omit<PayoutAccountRow, 'status' | 'providerSubaccountCode'>,
    ): Promise<PayoutAccountRow>;
    find(operatorId: string): Promise<PayoutAccountRow | null>;
    /** Saved straight after the provider creates it, so a retried approval reuses it. */
    setSubaccount(operatorId: string, code: string): Promise<void>;
  };
  lots: {
    /** DRAFT, version 1. Throws SlugTakenError when the slug is in use. */
    create(
      row: LotFields & { operatorId: string; slug: string; createdBy: string },
    ): Promise<LotRow>;
    /** Scoped: another operator's lot is not found. */
    find(operatorId: string, id: string): Promise<LotRow | null>;
    /** Unscoped, for Parkly staff. */
    findById(id: string): Promise<LotRow | null>;
    list(operatorId: string): Promise<(LotRow & { photoCount: number })[]>;
    /** Admin queue across operators, oldest first. */
    listByStatus(
      status: LotStatus,
    ): Promise<
      (LotRow & { photoCount: number; operatorName: string; pendingPriceCount: number })[]
    >;
    /** Optimistic concurrency: throws StaleVersionError unless `version` is current; bumps it. */
    update(
      operatorId: string,
      id: string,
      version: number,
      patch: Partial<LotFields>,
    ): Promise<LotRow>;
    /**
     * Moves the lot only if it is still in `from` (StaleVersionError otherwise);
     * bumps the version. The verified badge follows LIVE.
     */
    setStatus(
      operatorId: string,
      id: string,
      from: LotStatus,
      to: LotStatus,
      reason: string | null,
    ): Promise<LotRow>;
    /** The owner's self check-in switch (ADR 0016); null if the lot is not this operator's. */
    setSelfCheckin(operatorId: string, id: string, enabled: boolean): Promise<LotRow | null>;
    openingHours(lotId: string): Promise<OpeningHourRow[]>;
    openingHoursFor(lotIds: string[]): Promise<(OpeningHourRow & { lotId: string })[]>;
    /** Listable lots within `radiusM` of the point, nearest first. */
    searchLive(q: {
      lat: number;
      lng: number;
      radiusM: number;
      today: string;
      limit: number;
    }): Promise<(LiveLotRow & { distanceM: number })[]>;
    /** Listable lots whose name contains `text` (any case), by name. */
    searchLiveByName(text: string, today: string, limit: number): Promise<LiveLotRow[]>;
    /** A listable lot by id or slug; null when missing or not listable. */
    findLive(idOrSlug: string, today: string): Promise<LiveLotRow | null>;
    /** Replaces the whole week (days left out are closed). */
    setOpeningHours(lotId: string, days: OpeningHourRow[]): Promise<void>;
  };
  permits: {
    create(row: {
      lotId: string;
      permitNumber: string;
      issuedAt: string;
      expiresAt: string;
      documentFileId: string;
      submittedBy: string;
    }): Promise<PermitRow>;
    /** The most recently submitted permit for the lot. */
    latest(lotId: string): Promise<PermitRow | null>;
    find(id: string): Promise<PermitRow | null>;
    /** The APPROVED permit still valid on `today` with the latest expiry. */
    currentApproved(lotId: string, today: string): Promise<PermitRow | null>;
    /** From SUBMITTED or IN_REVIEW only (StaleVersionError otherwise). */
    approve(id: string, review: Review & { note: string }): Promise<PermitRow>;
    reject(id: string, review: Review & { reason: string }): Promise<PermitRow>;
    /**
     * APPROVED permits the daily job must act on (FR-LOT-007): expired on or
     * before `today` (Lagos date), or due a 30/14/7/1-day reminder not yet sent.
     * Soonest expiry first.
     */
    dueForExpiryCheck(today: string, limit: number): Promise<PermitRow[]>;
    /** Records the reminder; never moves backwards (30 → 14 → 7 → 1). */
    markReminded(id: string, days: number): Promise<void>;
    /** APPROVED → EXPIRED; false if it was not APPROVED any more. */
    expire(id: string): Promise<boolean>;
  };
  ratePlans: {
    /** PENDING_APPROVAL; replaces this product's pending change if there is one. */
    submit(
      row: RatePlanPrices & { lotId: string; product: Product; submittedBy: string },
    ): Promise<RatePlanRow>;
    /** ACTIVE and PENDING_APPROVAL plans, HOURLY → DAILY → MONTHLY. */
    current(lotId: string): Promise<RatePlanRow[]>;
    /** The newest REJECTED plan per product (the operator sees why). */
    latestRejected(lotId: string): Promise<RatePlanRow[]>;
    find(id: string): Promise<RatePlanRow | null>;
    /** ACTIVE plans of these lots. */
    activeFor(lotIds: string[]): Promise<RatePlanRow[]>;
    /**
     * PENDING_APPROVAL → ACTIVE from `at` (new bookings only), retiring the
     * product's previous ACTIVE plan in the same transaction. StaleVersionError
     * if it is no longer pending.
     */
    approve(id: string, review: Review): Promise<RatePlanRow>;
    reject(id: string, review: Review & { reason: string }): Promise<RatePlanRow>;
  };
  lotPhotos: {
    create(row: { lotId: string; fileId: string; sort: number }): Promise<LotPhotoRow>;
    /** In display order, with the stored file size. */
    list(lotId: string): Promise<(LotPhotoRow & { sizeBytes: number })[]>;
    find(lotId: string, id: string): Promise<LotPhotoRow | null>;
    findById(id: string): Promise<LotPhotoRow | null>;
    /** Approved photos with their public copy, in display order. */
    publicFor(lotIds: string[]): Promise<{ lotId: string; path: string; sort: number }[]>;
    /** From PENDING only (StaleVersionError otherwise); approval records the public copy. */
    review(
      id: string,
      decision: { status: 'APPROVED'; publicFileId: string } | { status: 'REJECTED' },
      review: Review,
    ): Promise<LotPhotoRow>;
    /** Deletes the photo and marks its file REJECTED (DELETED). */
    remove(lotId: string, id: string): Promise<void>;
  };
  verifications: {
    /** SUBMITTED, with its checklist items. */
    create(
      row: Omit<VerificationRow, 'id' | 'status' | 'rejectionReason' | 'createdAt'>,
    ): Promise<VerificationRow>;
    /** The most recent visit for the lot. */
    latest(lotId: string): Promise<VerificationRow | null>;
    /** The APPROVED visit still valid on `today` with the latest inspection. */
    currentApproved(lotId: string, today: string): Promise<VerificationRow | null>;
    find(id: string): Promise<VerificationRow | null>;
    /**
     * SUBMITTED/IN_REVIEW → APPROVED. In the same transaction a lower count on
     * site replaces the lot's total (and caps what is bookable) — doc 03 §4.1.
     */
    approve(id: string, review: Review): Promise<VerificationRow>;
    reject(id: string, review: Review & { reason: string }): Promise<VerificationRow>;
  };
  members: {
    /** Active members and open invites, oldest first, with the member's profile name. */
    list(
      operatorId: string,
    ): Promise<(MemberRow & { firstName: string | null; lastName: string | null })[]>;
    find(operatorId: string, id: string): Promise<MemberRow | null>;
    /** An ACTIVE member whose user has this phone/email hash, or an unexpired INVITED row for it. */
    findByContact(
      operatorId: string,
      contact: { phoneHash: Buffer | null; emailHash: Buffer | null },
      now: Date,
    ): Promise<MemberRow | null>;
    invite(row: {
      operatorId: string;
      role: 'MANAGER' | 'ATTENDANT';
      lotIds: string[];
      inviteeName: string;
      inviteePhoneHash: Buffer | null;
      inviteeEmailHash: Buffer | null;
      inviteTokenHash: Buffer;
      inviteExpiresAt: Date;
      invitedBy: string;
    }): Promise<MemberRow>;
    findByToken(
      tokenHash: Buffer,
    ): Promise<
      (MemberRow & { inviteePhoneHash: Buffer | null; inviteeEmailHash: Buffer | null }) | null
    >;
    /**
     * INVITED → ACTIVE plus the matching role grant, in one transaction; the
     * token is cleared. MemberExistsError if the user is already an active
     * member; StaleVersionError if the invite is no longer open.
     */
    accept(id: string, userId: string, at: Date): Promise<MemberRow>;
    /** → REMOVED; an active member also loses the role grant. StaleVersionError if already removed. */
    remove(operatorId: string, id: string, at: Date): Promise<MemberRow>;
    /** Lots an attendant may work: their explicit list, or every lot of the operator when empty. */
    attendantLotIds(userId: string): Promise<string[]>;
  };
  bookings: {
    /**
     * `fn_hold_booking` plus the booking's INITIATED payment, in one
     * transaction. Throws BookingHoldError (full, same car, lot not bookable,
     * bad window) or BookingCodeTakenError (retry with a new code).
     */
    hold(
      booking: NewBooking,
      payment: NewPayment,
      at: Date,
    ): Promise<{ booking: BookingRow; payment: PaymentRow }>;
    find(id: string): Promise<BookingRow | null>;
    /** Support looks a booking up by its PK-XXXXXX code. */
    findByCode(code: string): Promise<BookingRow | null>;
    /** Recent bookings across the platform (for admin views), latest first. */
    listRecent(limit?: number): Promise<BookingRow[]>;
    /** Upcoming: live and not yet ended, soonest first. Past: the rest, latest first. */
    listForDriver(
      driverId: string,
      which: 'upcoming' | 'past',
      now: Date,
      limit: number,
    ): Promise<BookingRow[]>;
    /** Active/upcoming bookings for a lot (CONFIRMED or CHECKED_IN or hold, ending after `now`). */
    listUpcomingForLot(lotId: string, now: Date): Promise<BookingRow[]>;
    /**
     * Ends an unpaid hold now (checkout could not start): EXPIRED with the
     * space given back and a SYSTEM history row. No-op unless PENDING_PAYMENT.
     * A payment that never reached the provider (INITIATED) becomes FAILED; one
     * the driver may still complete stays PENDING, so late money is refunded.
     */
    releaseHold(id: string, reason: string, at: Date): Promise<void>;
    holdExtension(
      extension: {
        id: string;
        bookingId: string;
        newEndAt: Date;
        priceKobo: number;
        platformAmountKobo: number;
        operatorAmountKobo: number;
        /** The unpaid hold gives its space back after this (fn_expire_holds). */
        holdExpiresAt: Date;
      },
      payment: NewPayment | null,
      at: Date,
    ): Promise<{ extension: BookingExtensionRow; payment: PaymentRow | null }>;
    /**
     * Gives a pending extension's held space back and closes it (checkout could
     * not start). False when it was not pending. An INITIATED payment becomes FAILED.
     */
    releaseExtension(id: string, status: 'EXPIRED' | 'CANCELLED', at: Date): Promise<boolean>;
    confirmExtension(extensionId: string, paymentId: string | null, at: Date): Promise<BookingRow>;
    findExtension(id: string): Promise<BookingExtensionRow | null>;
    cancel(
      bookingId: string,
      actor: 'DRIVER' | 'ADMIN' | 'SYSTEM',
      actorId: string,
      reason: string,
      refund: {
        amountKobo: number;
        reason:
          | 'DRIVER_CANCEL'
          | 'HOLD_EXPIRED'
          | 'LOT_UNAVAILABLE'
          | 'OPS_GOODWILL'
          | 'DUPLICATE'
          | 'PERMIT_SUSPENSION'
          | 'OTHER';
        refundPriceKobo: number;
        refundServiceFeeKobo: number;
      } | null,
      at: Date,
    ): Promise<{
      booking: BookingRow;
      /** One refund row per paid charge it is split across, newest first (gap review P-8). */
      refunds: { id: string; paymentId: string; amountKobo: number }[];
    }>;
  };
  payments: {
    find(id: string): Promise<PaymentRow | null>;
    latestForBooking(bookingId: string): Promise<PaymentRow | null>;
    listForBooking(bookingId: string): Promise<PaymentRow[]>;
    refundsForBooking(bookingId: string): Promise<RefundRow[]>;
    create(
      payment: NewPayment & {
        bookingId: string;
        kind: 'BOOKING' | 'EXTENSION' | 'OVERSTAY' | 'PASS';
      },
      at: Date,
    ): Promise<PaymentRow>;
    /** INITIATED → PENDING with the provider's checkout link. */
    checkoutStarted(
      id: string,
      checkout: { authorizationUrl: string; accessCode: string },
      at: Date,
    ): Promise<PaymentRow>;
    /**
     * Applies a verified charge (doc 02 §7.5): locks the payment and its
     * booking, decides with `confirmDecision`, then confirms (slots, history,
     * ledger), fails, refunds or does nothing. Safe to call any number of times.
     */
    settle(id: string, charge: VerifiedCharge, at: Date): Promise<SettleResult>;
    /** Records the provider's id for a refund we asked for. */
    refundRequested(refundId: string, providerRefundId: string): Promise<void>;
    /** Refunds the provider never accepted (no provider id), created before `before`. */
    refundsToRetry(q: {
      before: Date;
      limit: number;
    }): Promise<{ id: string; paymentId: string; amountKobo: number }[]>;
    /**
     * The provider's final word on a refund (refund.processed / refund.failed).
     * Matched by provider id, else the oldest pending refund of that payment.
     * A processed refund moves the payment to PARTIALLY_REFUNDED or REFUNDED.
     * False when no refund matched.
     */
    refundOutcome(o: {
      providerRefundId: string | null;
      paymentId: string;
      status: 'SUCCEEDED' | 'FAILED';
      at: Date;
    }): Promise<boolean>;
    /** Checkouts still open (PENDING) that were started in [from, to): the job asks the provider. */
    unsettled(window: { from: Date; to: Date; limit: number }): Promise<string[]>;
  };
  webhooks: {
    /** Stores a provider event once; a repeat of the same dedupe key is `duplicate`. */
    record(event: {
      provider: 'PAYSTACK' | 'FAKE';
      dedupeKey: string;
      eventType: string;
      reference: string | null;
      payload: unknown;
      at: Date;
    }): Promise<{ id: string; duplicate: boolean }>;
    finish(
      id: string,
      status: 'PROCESSED' | 'FAILED' | 'IGNORED',
      error: string | null,
      at: Date,
    ): Promise<void>;
    /** charge.success events left PENDING or FAILED, received before `before`, under `maxAttempts`. */
    retryable(q: {
      before: Date;
      maxAttempts: number;
      limit: number;
    }): Promise<{ id: string; reference: string | null }[]>;
  };
  receipts: {
    /**
     * Saves `content` as the booking's receipt. The first time it takes the
     * operator's next number at revision 1; when the content differs from the
     * stored one, the next revision under the same number; otherwise it is left
     * as it was. `changed` says whether anything was written.
     */
    issue(input: {
      bookingId: string;
      operatorId: string;
      content: unknown;
      at: Date;
    }): Promise<ReceiptRow & { changed: boolean }>;
    find(bookingId: string): Promise<ReceiptRow | null>;
  };
  notifications: {
    /** Queues an event once per dedupe key; false when that key was already queued. */
    enqueue(row: {
      userId: string;
      bookingId: string | null;
      eventKey: string;
      dedupeKey: string;
      payload: unknown;
      notBefore: Date;
    }): Promise<boolean>;
    /**
     * Leases up to `limit` due PENDING rows until `leaseUntil`, oldest first,
     * skipping rows another run holds, and counts the attempt.
     */
    claimDue(now: Date, limit: number, leaseUntil: Date): Promise<NotificationRow[]>;
    /** Records the outcome of an attempt. */
    finish(
      id: string,
      outcome: {
        status: NotificationStatus;
        channelsDone: string[];
        nextAttemptAt: Date;
        lastError: string | null;
        sentAt: Date | null;
      },
    ): Promise<void>;
    /**
     * Confirmed bookings starting within `startWithinMin`, confirmed or
     * checked-in bookings ending within `endWithinMin`, and no-shows that
     * started within the last `noShowSinceMin`, not yet notified.
     */
    dueReminders(
      now: Date,
      windows: { startWithinMin: number; endWithinMin: number; noShowSinceMin: number },
    ): Promise<ReminderCandidate[]>;
  };
  attend: {
    /** This user's attendant phone, by the id the PWA generated. */
    device(userId: string, clientDeviceId: string): Promise<AttendDeviceRow | null>;
    /**
     * Registers (or re-points) this phone to a lot. Never clears a manager's
     * block. `approve` is for owners and managers, whose phones need no approval.
     */
    registerDevice(input: {
      userId: string;
      clientDeviceId: string;
      operatorId: string;
      lotId: string;
      approve: boolean;
      at: Date;
    }): Promise<AttendDeviceRow>;
    operatorDevices(
      operatorId: string,
    ): Promise<(AttendDeviceRow & { lotName: string; attendantName: string | null })[]>;
    /** Approve or block one of this operator's phones; null if it is not theirs. */
    decideDevice(input: {
      operatorId: string;
      deviceId: string;
      decision: 'approve' | 'revoke';
      by: string;
      at: Date;
    }): Promise<AttendDeviceRow | null>;
    /** Paid bookings (and cancelled ones, to show red) overlapping [from, to). */
    manifest(lotId: string, from: Date, to: Date): Promise<ManifestRow[]>;
    walkIns(lotId: string): Promise<number>;
    /**
     * Applies one sync batch (doc 01 §5.3) with the shared event plan, one
     * event at a time under row locks. A repeated batch or event changes
     * nothing and answers DUPLICATE. Returns each event's verdict and the
     * sessions whose check-out was applied (for the overstay check).
     */
    applyBatch(
      batch: AttendBatch,
      events: AttendEventInput[],
    ): Promise<{ results: AttendEventResult[]; checkedOut: string[] }>;
    /** Session times and the booking's end and lot, for the overstay check. */
    session(id: string): Promise<{
      id: string;
      bookingId: string;
      lotId: string;
      endAt: Date;
      commissionBps: number;
      checkOutAt: Date | null;
    } | null>;
    setOverstay(sessionId: string, minutes: number, amountKobo: number): Promise<void>;
    sessionByBooking(bookingId: string): Promise<{
      id: string;
      bookingId: string;
      lotId: string;
      overstayMinutes: number;
      overstayAmountKobo: number;
      overstayStatus: 'NONE' | 'DUE' | 'PAID' | 'UNPAID' | 'WAIVED';
      checkInAt: Date | null;
      checkOutAt: Date | null;
    } | null>;
    markOverstayPaid(bookingId: string, at: Date): Promise<void>;
    /**
     * The driver's overstay still unpaid 24 hours after check-out (UNPAID), if
     * any: it blocks new bookings (FR-BOOK-008, gap review L-4).
     */
    unpaidOverstay(driverId: string): Promise<{
      bookingId: string;
      bookingCode: string;
      lotId: string;
      amountKobo: number;
    } | null>;
    /** DUE or UNPAID → WAIVED (ops goodwill); false when there was nothing to waive. */
    waiveOverstay(bookingId: string, at: Date): Promise<boolean>;
    /** Parked (checked in, not out) and expected (paid, due within 24 h, not in) per lot. */
    occupancy(
      lotIds: string[],
      now: Date,
    ): Promise<Map<string, { parked: number; expected: number }>>;
    /** Stay times and recorded overstay for these bookings (driver timer, ADR 0016). */
    sessionsForBookings(bookingIds: string[]): Promise<Map<string, StaySummary>>;
  };
  lotKeys: {
    /** The lot's ACTIVE QR signing key, if it has one yet. */
    active(lotId: string): Promise<LotKeyRow | null>;
    /**
     * Saves a new ACTIVE key. If another request saved one first (one ACTIVE
     * per lot), returns that one instead, so every ticket uses the same key.
     */
    createActive(row: Omit<LotKeyRow, 'status'>): Promise<LotKeyRow>;
    /** ACTIVE and RETIRING keys (for the manifest), and REVOKED kids. */
    forManifest(lotId: string): Promise<{ valid: LotKeyRow[]; revokedKids: string[] }>;
  };
  idempotency: {
    /** Claims (actor, key) for this request, or says how a repeat should be answered. */
    begin(key: {
      actorId: string;
      key: string;
      method: string;
      path: string;
      requestHash: string;
      expiresAt: Date;
    }): Promise<IdempotencyBegin>;
    complete(actorId: string, key: string, status: number, body: unknown): Promise<void>;
    /** Drops an IN_PROGRESS claim after an error so the client can retry the same key. */
    release(actorId: string, key: string): Promise<void>;
  };
  inventory: {
    /** Existing inventory rows for these lots with slot_start in [from, to). */
    slots(lotIds: string[], from: Date, to: Date): Promise<SlotRow[]>;
  };
  flags: {
    /** A missing flag is off. */
    enabled(key: string): Promise<boolean>;
  };
  audit: {
    write(entry: AuditEntry): Promise<void>;
    list(query: {
      entityType?: string | undefined;
      entityId?: string | undefined;
      actorUserId?: string | undefined;
      before?: { createdAt: Date; id: string } | undefined;
      limit: number;
    }): Promise<AuditRow[]>;
  };
  operators: {
    /**
     * Creates the operator, the owner's ACTIVE membership and their
     * OPERATOR_OWNER role in one transaction. Throws OperatorExistsError if the
     * user already owns an operator (MVP: one per owner).
     */
    create(
      input: OperatorDetails & { ownerUserId: string; commissionBps: number },
    ): Promise<OperatorRow>;
    find(id: string): Promise<OperatorRow | null>;
    update(id: string, patch: Partial<OperatorDetails>): Promise<OperatorRow>;
    /** KYB → SUBMITTED (callers check the gaps first). */
    submitKyb(id: string, at: Date): Promise<OperatorRow>;
    /** KYB review queue: oldest submission first. */
    list(filter: { kybStatus?: OperatorRow['kybStatus'] | undefined }): Promise<OperatorRow[]>;
    /**
     * SUBMITTED → APPROVED in one transaction: operator ACTIVE, documents
     * APPROVED, payout account ACTIVE with the full number erased. Needs the
     * subaccount code saved first. StaleVersionError if KYB is no longer SUBMITTED.
     */
    approveKyb(id: string, review: { reviewerId: string; at: Date }): Promise<OperatorRow>;
    /** SUBMITTED → REJECTED with a reason; the owner can edit and resubmit. */
    rejectKyb(
      id: string,
      review: { reviewerId: string; at: Date; reason: string },
    ): Promise<OperatorRow>;
    /** The operator this user owns, if any. */
    ownedBy(userId: string): Promise<string | null>;
    members(
      operatorId: string,
    ): Promise<{ userId: string; role: RoleGrant['role']; firstName: string | null }[]>;
  };
  settings: {
    get<T>(key: string): Promise<T | undefined>;
  };
};

export class DuplicatePlateError extends Error {}
export class DsrAlreadyOpenError extends Error {}
export class OperatorExistsError extends Error {}
export class SlugTakenError extends Error {}
export class MemberExistsError extends Error {}
export class StaleVersionError extends Error {}

export type BookingHoldCode =
  | 'BOOKING_SLOT_UNAVAILABLE'
  | 'BOOKING_OVERLAP_SAME_VEHICLE'
  | 'LOT_NOT_BOOKABLE'
  | 'BOOKING_WINDOW_INVALID'
  | 'BOOKING_NOT_EXTENDABLE'
  | 'BOOKING_NOT_CANCELLABLE'
  | 'EXTENSION_UNAVAILABLE';

/** `fn_hold_booking` refused; `code` is the problem+json code. */
export class BookingHoldError extends Error {
  constructor(readonly code: BookingHoldCode) {
    super(code);
  }
}
export class BookingCodeTakenError extends Error {}

/** A lot's Ed25519 QR signing key (ADR 0007); the private key is FieldCrypto ciphertext. */
export type LotKeyRow = {
  id: string;
  lotId: string;
  kid: string;
  publicKey: Buffer;
  privateKeyCiphertext: string;
  status: 'ACTIVE' | 'RETIRING' | 'REVOKED';
  activatedAt: Date;
};

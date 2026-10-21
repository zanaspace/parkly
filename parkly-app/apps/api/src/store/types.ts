import type { RoleGrant } from '@parkly/domain/authz';
import type { Bucket } from '../providers/index.js';

/**
 * Everything the API reads or writes in Postgres goes through this interface.
 * Production: DrizzleStore. Route tests: MemoryStore (same behaviour, no DB).
 * Scoping rules live in the callers' `can()` checks and in each method's
 * userId/operatorId parameters (doc 05 §5.2 rule 2).
 */

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
export type ConsentType = 'TERMS' | 'PRIVACY' | 'MARKETING' | 'LOCATION' | 'OPERATOR_AGREEMENT';
export type Platform = 'ANDROID' | 'IOS' | 'WEB' | 'PWA';

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
  version: number;
  createdAt: Date;
};

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
  createdAt: Date;
};

export type Product = 'HOURLY' | 'DAILY' | 'MONTHLY';

export type RatePlanPrices = {
  hourlyRateKobo: number | null;
  minMinutes: number;
  dailyCapKobo: number | null;
  dailyRateKobo: number | null;
  monthlyRateKobo: number | null;
};

export type RatePlanRow = RatePlanPrices & {
  id: string;
  lotId: string;
  product: Product;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'RETIRED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: Date;
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
    setLookupHashes(
      id: string,
      hashes: { phoneHash: Buffer | null; emailHash: Buffer | null },
    ): Promise<void>;
    updateProfile(id: string, patch: { firstName?: string; lastName?: string }): Promise<UserRow>;
    setStatus(id: string, status: UserStatus): Promise<void>;
    setMarketingOptIn(id: string, value: boolean): Promise<void>;
    roles(id: string): Promise<RoleGrant[]>;
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
    list(operatorId: string): Promise<(LotRow & { photoCount: number })[]>;
    /** Optimistic concurrency: throws StaleVersionError unless `version` is current; bumps it. */
    update(
      operatorId: string,
      id: string,
      version: number,
      patch: Partial<LotFields>,
    ): Promise<LotRow>;
    /** Moves the lot only if it is still in `from` (StaleVersionError otherwise); bumps the version. */
    setStatus(
      operatorId: string,
      id: string,
      from: LotStatus,
      to: LotStatus,
      reason: string | null,
    ): Promise<LotRow>;
    openingHours(lotId: string): Promise<OpeningHourRow[]>;
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
  };
  ratePlans: {
    /** PENDING_APPROVAL; replaces this product's pending change if there is one. */
    submit(
      row: RatePlanPrices & { lotId: string; product: Product; submittedBy: string },
    ): Promise<RatePlanRow>;
    /** ACTIVE and PENDING_APPROVAL plans, HOURLY → DAILY → MONTHLY. */
    current(lotId: string): Promise<RatePlanRow[]>;
  };
  lotPhotos: {
    create(row: { lotId: string; fileId: string; sort: number }): Promise<LotPhotoRow>;
    /** In display order, with the stored file size. */
    list(lotId: string): Promise<(LotPhotoRow & { sizeBytes: number })[]>;
    find(lotId: string, id: string): Promise<LotPhotoRow | null>;
    /** Deletes the photo and marks its file REJECTED (DELETED). */
    remove(lotId: string, id: string): Promise<void>;
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
export class StaleVersionError extends Error {}

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
  commissionBps: number;
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

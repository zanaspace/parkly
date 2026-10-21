import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, bytea, createdAt, id, updatedAt } from './common.js';
import { users } from './identity.js';

export const storageBucketEnum = pgEnum('storage_bucket', [
  'kyb-docs',
  'permits',
  'verification',
  'incident-evidence',
  'lot-photos',
  'lot-photos-public',
  'exports',
]);
export const dataClassEnum = pgEnum('data_class', ['C1', 'C2', 'C3', 'C4']);
/** PENDING: signed upload URL issued. VERIFIED: size, MIME sniff and sha256 checked server-side. */
export const fileStatusEnum = pgEnum('file_status', ['PENDING', 'VERIFIED', 'REJECTED']);

/**
 * One row per Supabase Storage object (doc 02 §2.9, doc 06 §1.2). Storage has
 * no object tags, so class and retention live here and retention jobs delete
 * through this table.
 */
export const files = pgTable(
  'files',
  {
    id: id(),
    bucket: storageBucketEnum('bucket').notNull(),
    path: text('path').notNull(),
    dataClass: dataClassEnum('data_class').notNull(),
    retentionPolicy: varchar('retention_policy', { length: 64 }).notNull(),
    ownerEntityType: varchar('owner_entity_type', { length: 32 }).notNull(),
    ownerEntityId: uuid('owner_entity_id').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    status: fileStatusEnum('status').notNull().default('PENDING'),
    mime: varchar('mime', { length: 100 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: bytea('sha256').notNull(),
    rejectionReason: text('rejection_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('files_bucket_path_key').on(t.bucket, t.path),
    index('files_owner_idx').on(t.ownerEntityType, t.ownerEntityId),
    index('files_uploaded_by_idx').on(t.uploadedBy),
    // Abandoned uploads are swept by a retention job.
    index('files_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'PENDING'`),
    apiAccess('files'),
  ],
).enableRLS();

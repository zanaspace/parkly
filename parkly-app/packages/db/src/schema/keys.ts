import { sql } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { apiAccess, bytea, createdAt, id } from './common.js';
import { lots } from './lots.js';

export const signingKeyStatusEnum = pgEnum('signing_key_status', ['ACTIVE', 'RETIRING', 'REVOKED']);

/**
 * Ed25519 key per lot for offline QR tickets (doc 02 §2.4, doc 01 §7, ADR 0007).
 * The public key goes to attendant devices; the private key is app-level
 * envelope-encrypted (FieldCrypto) and never leaves the API.
 */
export const lotSigningKeys = pgTable(
  'lot_signing_keys',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),
    kid: varchar('kid', { length: 40 }).notNull(),
    publicKey: bytea('public_key').notNull(), // C1
    privateKeyCiphertext: text('private_key_ciphertext').notNull(), // C4 [enc]
    status: signingKeyStatusEnum('status').notNull().default('ACTIVE'),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull(),
    /** When a RETIRING key stops being accepted. */
    retireAfter: timestamp('retire_after', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('lot_signing_keys_kid_key').on(t.kid),
    // At most one ACTIVE key per lot.
    uniqueIndex('lot_signing_keys_active_key')
      .on(t.lotId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index('lot_signing_keys_lot_idx').on(t.lotId),
    apiAccess('lot_signing_keys'),
  ],
).enableRLS();

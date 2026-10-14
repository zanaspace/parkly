import { boolean, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { apiAccess, apiAppendOnly, bytea, createdAt, id, updatedAt } from './common.js';

/** Append-only record of privileged actions; retained 7 years (doc 02 §2.9, doc 06). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    action: text('action').notNull(), // e.g. lot.suspend, refund.approve, user.pii_view
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'), // redacted
    after: jsonb('after'), // redacted
    ipHash: bytea('ip_hash'), // C3
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
    ...apiAppendOnly('audit_logs'),
  ],
).enableRLS();

/** Runtime-tunable business settings (doc 02 §8). Never hard-code these in clients. */
export const platformSettings = pgTable(
  'platform_settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    description: text('description'),
    updatedBy: uuid('updated_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [apiAccess('platform_settings')],
).enableRLS();

export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    enabled: boolean('enabled').notNull().default(false),
    rules: jsonb('rules').notNull().default({}), // e.g. {"operatorIds":[…],"percent":10}
    updatedBy: uuid('updated_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [apiAccess('feature_flags')],
).enableRLS();

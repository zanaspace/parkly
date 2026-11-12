import { z } from 'zod';

/** FR-ADM-005: platform settings a super admin can change (doc 02 §8). */
export const SettingItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  kind: z.enum(['int', 'boolean']),
  unit: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  default: z.union([z.number(), z.boolean()]),
  /** What the API uses now: the saved value, else the default. */
  value: z.union([z.number(), z.boolean()]),
  /** True while no value has been saved. */
  isDefault: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});

export const SettingListSchema = z.object({ items: z.array(SettingItemSchema) });

export const SetSettingRequestSchema = z.object({
  value: z.union([z.number(), z.boolean()]),
  /** Kept in the audit log with the old and new value. */
  reason: z.string().trim().min(5).max(500),
});

export const FeatureFlagItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});

export const FeatureFlagListSchema = z.object({ items: z.array(FeatureFlagItemSchema) });

export const SetFeatureFlagRequestSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(5).max(500),
});

export type SettingItem = z.infer<typeof SettingItemSchema>;
export type SettingList = z.infer<typeof SettingListSchema>;
export type FeatureFlagItem = z.infer<typeof FeatureFlagItemSchema>;
export type FeatureFlagList = z.infer<typeof FeatureFlagListSchema>;
